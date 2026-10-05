// Default website content + assistant settings.
// These seed data/db.json on first start. After that, everything is edited
// from the admin panel and stored in data/db.json.

export const DEFAULT_SITE = {
  brand: {
    name: 'IRONFORGE FITNESS',
    tagline: 'Premium strength & performance training for people who refuse to settle.',
    founded: 2014
  },
  announcement: {
    enabled: false,
    text: 'New member offer: your first personal training session is on us.',
    linkText: 'Claim offer',
    linkHref: '#contact'
  },
  stats: {
    members: 4200,
    trainers: 35,
    years: 11,
    equipment: 150
  },
  programs: [
    { id: 'strength', title: 'Strength Training', description: 'Build raw power with progressive overload programming and expert form coaching.' },
    { id: 'weightloss', title: 'Weight Loss', description: 'High-intensity conditioning and nutrition guidance to burn fat and boost metabolism.' },
    { id: 'muscle', title: 'Muscle Building', description: 'Hypertrophy-focused training blocks designed to maximize lean muscle growth.' },
    { id: 'personal', title: 'Personal Training', description: 'One-on-one coaching tailored entirely to your goals, schedule, and pace.' },
    { id: 'functional', title: 'Functional Fitness', description: 'Full-body movement training that builds real-world strength, mobility, and balance.' }
  ],
  currency: '$',
  plans: [
    {
      id: 'basic', name: 'Basic', tagline: 'For those starting their journey', price: 29, period: '/mo', featured: false, badge: '',
      features: [
        { text: 'Full gym floor access', included: true },
        { text: 'Standard equipment access', included: true },
        { text: 'Locker room & showers', included: true },
        { text: '1 group class / week', included: true },
        { text: 'Personal training sessions', included: false },
        { text: 'Nutrition coaching', included: false }
      ]
    },
    {
      id: 'pro', name: 'Pro', tagline: 'Our most popular performance plan', price: 59, period: '/mo', featured: true, badge: 'Most Popular',
      features: [
        { text: 'Full gym floor access', included: true },
        { text: 'Premium equipment access', included: true },
        { text: 'Locker room & showers', included: true },
        { text: 'Unlimited group classes', included: true },
        { text: '2 personal training sessions', included: true },
        { text: '1-on-1 nutrition coaching', included: false }
      ]
    },
    {
      id: 'elite', name: 'Elite', tagline: 'Total access, total transformation', price: 99, period: '/mo', featured: false, badge: '',
      features: [
        { text: '24/7 full facility access', included: true },
        { text: 'Premium equipment access', included: true },
        { text: 'Private locker & towel service', included: true },
        { text: 'Unlimited group classes', included: true },
        { text: 'Unlimited personal training', included: true },
        { text: '1-on-1 nutrition coaching', included: true }
      ]
    }
  ],
  trainers: [
    { name: 'Marcus Reed', role: 'Head Strength Coach', image: 'trainer1.jpg' },
    { name: 'Elena Cruz', role: 'Nutrition & Weight Loss', image: 'trainer2.jpg' },
    { name: 'Jordan Blake', role: 'Personal Training Director', image: 'trainer3.jpg' },
    { name: 'Sofia Marchetti', role: 'Functional Fitness Coach', image: 'trainer4.jpg' }
  ],
  hours: [
    { day: 'Monday – Friday', time: '05:00 – 23:00' },
    { day: 'Saturday', time: '07:00 – 21:00' },
    { day: 'Sunday', time: '08:00 – 18:00' },
    { day: 'Public Holidays', time: '09:00 – 15:00', note: true }
  ],
  contact: {
    addressLine1: '228 Iron District Avenue',
    addressLine2: 'Downtown Metro City, MC 10245',
    phone: '(555) 812-4470',
    email: 'hello@ironforgefitness.com',
    mapEmbedUrl: ''
  },
  faqs: [
    { q: 'Do you offer a free trial or consultation?', a: 'Yes — book a free consultation through the Contact section and a coach will design a plan around your goals.' },
    { q: 'Can I cancel my membership?', a: 'Plans are flexible with no hidden fees, and you can cancel anytime. Contact the team to make changes to your membership.' },
    { q: 'How do I get started?', a: 'Learn about IRONFORGE, choose a fitness goal, explore the programs, compare membership plans, then send an enquiry from the Contact section. The team will guide you from there.' },
    { q: 'Can the AI assistant book or cancel a membership for me?', a: 'Not yet. The assistant can answer questions and point you to the right plan, but bookings, payments and cancellations are handled by the IRONFORGE team.' }
  ]
};

export const DEFAULT_SETTINGS = {
  assistant: {
    name: 'AI Support Coach',
    greeting: 'How can I help you train today?',
    subtitle: 'Ask about memberships, programs, trainers, opening hours, workouts, nutrition and recovery — by voice or chat.',
    voiceReplies: true,
    voiceRate: 1,
    voiceLang: 'en-US',
    continuousConversation: true,
    extraInstructions: '',
    suggestions: [
      'What membership plans do you offer?',
      'What are your opening hours?',
      'Which program is best for fat loss?',
      'Give me a beginner full-body workout',
      'How much protein do I need to build muscle?',
      'How can I contact IRONFORGE?'
    ]
  }
};
