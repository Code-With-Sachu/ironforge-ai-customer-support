import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import Database from "better-sqlite3";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");
const DB_FILE = path.join(process.cwd(), "rag.db");

if (!process.env.GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY is missing in .env");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const db = new Database(DB_FILE);

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding TEXT NOT NULL
  );
`);

db.exec(`DELETE FROM documents`);

function chunkText(text, chunkSize = 1200, overlap = 200) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();

    if (chunk.length > 50) {
      chunks.push(chunk);
    }

    start += chunkSize - overlap;
  }

  return chunks;
}

async function createEmbedding(text) {
  const response = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
    config: {
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: 768
    }
  });

  return response.embeddings[0].values;
}

async function processPDF(fileName) {
  const filePath = path.join(KNOWLEDGE_DIR, fileName);

  console.log(`\n📄 Processing: ${fileName}`);

  const buffer = fs.readFileSync(filePath);

  const parser = new PDFParse({
    data: buffer,
  });

  let data;

  try {
    data = await parser.getText();
  } finally {
    await parser.destroy();
  }

  console.log(`   Extracted characters: ${data.text.length}`);

  const chunks = chunkText(data.text);

  console.log(`   Created chunks: ${chunks.length}`);

  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i];

    console.log(`   🔹 Gemini embedding ${i + 1}/${chunks.length}`);

    const embedding = await createEmbedding(content);

    db.prepare(`
      INSERT INTO documents
      (source, chunk_index, content, embedding)
      VALUES (?, ?, ?, ?)
    `).run(
      fileName,
      i,
      content,
      JSON.stringify(embedding)
    );
  }
}

async function main() {
  console.log("======================================");
  console.log(" IRONFORGE GEMINI RAG INGESTION");
  console.log("======================================");

  const files = fs
    .readdirSync(KNOWLEDGE_DIR)
    .filter(file => file.toLowerCase().endsWith(".pdf"));

  console.log(`\n📚 PDFs found: ${files.length}`);

  if (files.length === 0) {
    console.error("❌ No PDF files found in knowledge/");
    process.exit(1);
  }

  for (const file of files) {
    await processPDF(file);
  }

  const count = db
    .prepare("SELECT COUNT(*) AS count FROM documents")
    .get();

  console.log("\n======================================");
  console.log("✅ GEMINI RAG INGESTION COMPLETE");
  console.log("======================================");

  console.log(`📚 PDFs processed: ${files.length}`);
  console.log(`🧩 Chunks stored: ${count.count}`);
  console.log(`💾 Database: ${DB_FILE}`);

  db.close();
}

main().catch(error => {
  console.error("\n❌ Ingestion failed:");
  console.error(error);

  try {
    db.close();
  } catch {}

  process.exit(1);
});