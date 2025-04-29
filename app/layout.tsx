// app/layout.tsx (modified to add our Providers)
import { Geist } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import './globals.css';
import { SessionProvider } from '@/providers/session-provider';
import { PreferencesProvider } from '@/providers/preferences-provider';
import { SessionTimeoutModal } from '@/components/session/session-timeout-modal';
import { Providers } from './providers';

const defaultUrl = process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3000';

export const metadata = {
    metadataBase: new URL(defaultUrl),
    title: 'FPL Chat Assistant',
    description:
        'Get instant answers to all your FPL questions - stats, players, strategies, and more',
};

const geistSans = Geist({
    display: 'swap',
    subsets: ['latin'],
});

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            className={geistSans.className}
            suppressHydrationWarning
        >
            <body className="bg-background text-foreground">
                <SessionProvider>
                    <PreferencesProvider>
                        <ThemeProvider
                            attribute="class"
                            defaultTheme="system"
                            enableSystem
                            disableTransitionOnChange
                        >
                            <Providers>
                                <main className="min-h-screen flex flex-col">
                                    {children}
                                    <SessionTimeoutModal />
                                </main>
                            </Providers>
                        </ThemeProvider>
                    </PreferencesProvider>
                </SessionProvider>
            </body>
        </html>
    );
}
