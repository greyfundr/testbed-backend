export const formatPhoneForTermii = (phone: string): string => {
  return phone.startsWith('+') ? phone.slice(1) : phone;
};
