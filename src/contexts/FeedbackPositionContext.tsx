import { createContext, useContext, useState } from "react";

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
  return (
    <FeedbackPositionContext.Provider value={{ hasCommentBar, setHasCommentBar }}>
      {children}
    </FeedbackPositionContext.Provider>
  );
}

export function useFeedbackPosition() {
  return useContext(FeedbackPositionContext);
}
