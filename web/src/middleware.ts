import { updateSession } from "@/lib/supabase/middleware";

export const config = {
  matcher: [
    "/((?!api/|_next/|_static|favicon.ico|.*\\.).*)",
  ],
};

export default updateSession;
