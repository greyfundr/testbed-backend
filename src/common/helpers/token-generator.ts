export function generateNumericToken(numberOfToken: number) {
  const characters = '0123456789';
  let result = '';
  for (let i = 0; i < numberOfToken; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
