export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  score: PasswordStrengthScore;
  label: "Enter a password" | "Too weak" | "Fair" | "Good" | "Strong";
  acceptable: boolean;
  guidance: string;
  checks: {
    longEnough: boolean;
    mixedCase: boolean;
    hasNumber: boolean;
    hasSymbol: boolean;
    isLongPassphrase: boolean;
  };
}

export function assessPassword(password: string): PasswordStrength {
  const checks = {
    longEnough: password.length >= 10,
    mixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSymbol: /[^A-Za-z0-9\s]/.test(password),
    isLongPassphrase: password.length >= 16,
  };
  const variety = [checks.mixedCase, checks.hasNumber, checks.hasSymbol].filter(Boolean).length;
  const acceptable = checks.longEnough && (variety >= 2 || checks.isLongPassphrase);

  let score: PasswordStrengthScore = 0;
  if (password.length > 0) score = 1;
  if (checks.longEnough) score = 2;
  if (checks.longEnough && (variety >= 2 || password.length >= 14)) score = 3;
  if (checks.longEnough && variety === 3 && password.length >= 12) score = 4;
  if (password.length >= 18 && variety >= 1) score = 4;

  const label = (["Enter a password", "Too weak", "Fair", "Good", "Strong"] as const)[score];
  let guidance = "Use at least 10 characters.";
  if (checks.longEnough && !acceptable) {
    guidance = "Add two of these: uppercase letters, numbers or symbols — or use a 16-character passphrase.";
  } else if (acceptable && score < 4) {
    guidance = "Good start. More length or variety will make it even stronger.";
  } else if (score === 4) {
    guidance = "Strong password — you are ready to go.";
  }

  return { score, label, acceptable, guidance, checks };
}
