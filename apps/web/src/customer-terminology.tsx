import { createContext, useContext, type ReactNode } from 'react';

const CustomerSector = createContext('CLINIC');

export function customerText(text: string, businessType = 'CLINIC') {
  if (businessType === 'CLINIC') return text;
  const singular = businessType === 'EDUCATION' ? 'alumno' : 'cliente';
  return text.replace(/\bpacientes?\b/gi, word => {
    const replacement = singular + (word.toLowerCase().endsWith('s') ? 's' : '');
    return word === word.toUpperCase() ? replacement.toUpperCase()
      : word[0] === word[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
  }).replace(/de la clínica/g, 'del negocio');
}

export function CustomerTerminologyProvider({ businessType, children }: { businessType?: string; children: ReactNode }) {
  return <CustomerSector.Provider value={businessType ?? 'CLINIC'}>{children}</CustomerSector.Provider>;
}

/** Translate interface copy only. Patient names, stored data and API paths remain untouched. */
export function useCustomerText() {
  const sector = useContext(CustomerSector);
  return (text: string) => customerText(text, sector);
}
