// Caracterele de control (U+0000..U+001F și U+007F). NUL, de exemplu, face Postgres să respingă textul (22021).
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function hasControlChars(value: string): boolean {
  return CONTROL_CHARS.test(value);
}
