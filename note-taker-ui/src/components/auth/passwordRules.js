/* The rules the server keeps for a password, said before the request instead
   of after: at signing up and at changing it in Settings. */
const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_HINT = 'Eight or more characters, with a letter and a number.';

export const passwordProblem = ({ username = '', password = '' }) => {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (username.trim().toLowerCase() === password.trim().toLowerCase()) return 'Password cannot match your username.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must include at least one letter and one number.';
  return '';
};
