import { createContext, useContext, useState, useMemo } from "react";

interface FeedbackPositionContextValue {
  hasCommentBar: boolean;
  setHasCommentBar: (value: boolean) => void;
}

const FeedbackPositionContext = createContext<FeedbackPositionContextValue>({
  hasCommentBar: false,
  setHasCommentBar: () => {},
});

export function FeedbackPositionProvider({ children }: { children: React.ReactNode }) {
  const [hasCommentBar, setHasCommentBar] = useState(false);
  const value = useMemo(() => ({ hasCommentBar, setHasCommentBar }), [hasCommentBar]);
  return (
    <FeedbackPositionContext.Provider value={value}>
      {children}
    </FeedbackPositionContext.Provider>
  );
}

export function useFeedbackPosition() {
  return useContext(FeedbackPositionContext);
}
