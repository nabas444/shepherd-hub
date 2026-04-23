📄 Shepherd Hub

[![Live Demo](https://img.shields.io/badge/Live-Demo-green?style=for-the-badge)](https://unity-shepherd.lovable.app/)

🌐 **Live Demo:** https://unity-shepherd.lovable.app/

🧠 Overview

Shepherd Hub is a modern church/community management and spiritual growth platform built with a full-stack TypeScript setup. It combines member management, mentorship, events, devotionals, and real-time interaction into one unified system.

The platform is designed to help leaders shepherd people effectively, while also helping members stay engaged, grow spiritually, and stay connected.

✨ Core Features

👥 Member Management

View and manage all members
Individual member profiles
Track engagement and participation
Admin-level controls for oversight

🧑‍🤝‍🧑 Mentorship System

Structured mentorship workflows
Connect mentors with mentees
Track mentorship progress and relationships

📅 Events Management

Create and manage events
Dynamic event pages (events/:eventId)
Allow members to view and engage with upcoming activities

📖 Devotionals

Daily or scheduled devotional content
Built-in Daily Word widget
Encourages consistent spiritual growth

💬 Chat System

Real-time or async communication between users
Enables community interaction and follow-ups

🔔 Notifications

Notification system (e.g., NotificationBell)
Keeps users updated on important activities

🧭 Onboarding Journey

Guided onboarding experience for new users
Helps users get started with the platform quickly

📊 Dashboard

Central hub for:
Activity overview
Quick access to features
Engagement insights

👤 User Profiles

Personal profile management
Authentication-protected routes

🔐 Authentication & Authorization

Secure login/signup system
Role-based access (admin vs user)
Middleware-protected routes

🏗️ Tech Stack

Frontend
React 19
TanStack Router (file-based routing)
TanStack React Query (data fetching & caching)
Tailwind CSS 4
Radix UI
Recharts
Backend / Infrastructure
Supabase
Authentication
Database
Row-level security
Cloudflare (Wrangler + Vite plugin)
Tooling
Vite
TypeScript
ESLint + Prettier


📁 Project Structure (Simplified)
src/
 ├── components/        # Reusable UI + widgets
 ├── routes/            # App pages (TanStack Router)
 │    ├── dashboard.tsx
 │    ├── members.tsx
 │    ├── events.tsx
 │    ├── mentorship.tsx
 │    ├── devotionals.tsx
 │    ├── chat.tsx
 │    └── admin.tsx
 ├── hooks/             # Custom React hooks
 ├── integrations/      # Supabase client & middleware
 └── lib/               # Utilities



🚀 Getting Started

1. Install dependencies
npm install
# or
bun install
2. Setup environment variables

Create a .env file and add your Supabase credentials:

VITE_SUPABASE_URL=your_url
VITE_SUPABASE_ANON_KEY=your_key
3. Run development server
npm run dev
4. Build for production
npm run build

🔐 Environment & Backend

This project uses Supabase for:

Authentication
Database
Backend logic via SQL migrations (/supabase/migrations)

Make sure your Supabase project is set up and migrations are applied.

🎯 Purpose

Shepherd Hub is built to:

Help leaders care for and track members
Enable intentional discipleship and mentorship
Provide tools for spiritual growth and engagement
Centralize church/community operations in one platform


🛠️ Future Improvements

Mobile app version
Push notifications
Attendance tracking
Sermon/media uploads
Role-based dashboards (pastor, leader, member)
