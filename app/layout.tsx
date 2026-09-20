import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'How When Go — 스마트 시간표 통합 검색', description: '버스와 KTX 통합 시간표 및 가성비 비교', icons: { icon: '/favicon.svg' } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html>; }
