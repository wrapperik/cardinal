/** Case-insensitive so a mobile keyboard's automatic capitalisation cannot block a deliberate action. */
export function matchesTypedConfirmation(value: string, confirmation: string): boolean {
  return value.trim().toUpperCase() === confirmation.toUpperCase();
}
