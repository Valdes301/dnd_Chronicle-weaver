import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: 'Tessitore di Cronache - Archivio e Compendio D&D 5e',
  description: 'Tessitore di Cronache - Assistente e Compendio per D&D 5e con importatore PDF e catalogazione intelligente del Bestiario.',
  openGraph: {
    title: 'Tessitore di Cronache - Archivio e Compendio D&D 5e',
    description: 'Tessitore di Cronache - Assistente e Compendio per D&D 5e con importatore PDF e catalogazione intelligente del Bestiario.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="dark">
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
