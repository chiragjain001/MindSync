import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import "./globals.css"
import { Toaster } from "sonner"
import SupabaseProvider from "@/components/supabase-provider"
import AppLoadingProvider from "@/components/loading-provider"
import RouteLoadingHandler from "@/components/route-loading-handler"

export const metadata: Metadata = {
  title: "MindSync",
  description: "MindSync is your all-in-one productivity and wellness companion that helps you stay organized, build positive habits, and nurture your mental health.",
  generator: "MindSync App - Built with React & Supabase",
  icons: {
    icon: '/mindSync-logo.png',
    shortcut: '/mindSync-logo.png',
    apple: '/mindSync-logo.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {

  return (
    <html lang="en" className="antialiased">
      <head>
      </head>
      <body className={`overflow-hidden font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        {/* Initial CSS-based loader - shows immediately */}
        <div id="initial-loader" className="initial-loader">
          <div className="initial-loader-content">
            <div className="initial-loader-circle"></div>
            <div className="initial-loader-circle"></div>
            <div className="initial-loader-circle"></div>
            <div className="initial-loader-shadow"></div>
            <div className="initial-loader-shadow"></div>
            <div className="initial-loader-shadow"></div>
          </div>
          <div className="initial-loader-message">Loading application...</div>
        </div>
        
        <AppLoadingProvider>
          <SupabaseProvider>
            <RouteLoadingHandler />
            <Suspense fallback={null}>{children}</Suspense>
            <Analytics />
            <Toaster richColors closeButton />
          </SupabaseProvider>
        </AppLoadingProvider>
      </body>
    </html>
  )
}
