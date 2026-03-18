
import './globals.css';

export const metadata = {
  title: 'FIFA turnaje',
  description: 'Živá turnajová aplikace pro FC 26'
};

export default function RootLayout({ children }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
