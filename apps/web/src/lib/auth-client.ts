import { createAuthClient } from "better-auth/react";
import {inferAdditionalFields} from "better-auth/client/plugins";


export const authClient = createAuthClient({

  plugins: [
  inferAdditionalFields({
    user: {
      role: { type: "string", required: false, defaultValue: 'user', input: false },
}}),
],
  baseURL: process.env.NEXT_PUBLIC_SERVER_URL!,
});
