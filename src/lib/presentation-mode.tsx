import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface PresentationModeContextType {
  presentationMode: boolean;
  togglePresentationMode: () => void;
}

const PresentationModeContext = createContext<PresentationModeContextType>({
  presentationMode: false,
  togglePresentationMode: () => {},
});

export function PresentationModeProvider({ children }: { children: ReactNode }) {
  const [presentationMode, setPresentationMode] = useState(false);
  const togglePresentationMode = useCallback(() => setPresentationMode((v) => !v), []);

  return (
    <PresentationModeContext.Provider value={{ presentationMode, togglePresentationMode }}>
      {children}
    </PresentationModeContext.Provider>
  );
}

export function usePresentationMode() {
  return useContext(PresentationModeContext);
}
