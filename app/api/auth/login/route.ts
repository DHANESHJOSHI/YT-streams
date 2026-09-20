import { NextRequest, NextResponse } from 'next/server';
import { isValidPassword, createSessionToken, AUTH_COOKIE_NAME } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();

    if (!password || !isValidPassword(password)) {
      return NextResponse.json(
        { success: false, message: 'Invalid password. Access denied.' },
        { status: 401 }
      );
    }

    const token = createSessionToken(password);
    const response = NextResponse.json({ success: true, message: 'Authenticated' });

    // Set secure cookie for 30 days
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, message: 'Server authentication error' },
      { status: 500 }
    );
  }
}
