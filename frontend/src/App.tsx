import { useCallback } from 'react';
import { SessionProvider, useSession } from '@/contexts/SessionContext';
import { UploadScreen } from '@/components/UploadScreen';
import { WaitingRoom } from '@/components/WaitingRoom';
import { InterviewScreen } from '@/components/InterviewScreen';
import { FeedbackScreen } from '@/components/FeedbackScreen';
import { FeedbackPreview } from '@/pages/FeedbackPreview';
import { buildAgent3Request, callAgent3 } from '@/services/agent3Client';
import { InterviewAdmissionError } from '@/services/interviewSessionClient';

function AppContent() {
  const { state, dispatch, webSocketClient } = useSession();

  // Dev-only: /feedback-preview shows FeedbackReport with mock data
  if (import.meta.env.DEV && window.location.pathname === '/feedback-preview') {
    return <FeedbackPreview />;
  }

  const handleUploadSubmit = useCallback(
    (pdf: File, jdText: string) => {
      dispatch({ type: 'SUBMIT_UPLOAD', payload: { pdf, jdText } });
    },
    [dispatch]
  );

  const handleFeedbackRetry = useCallback(async () => {
    dispatch({ type: 'AGENT3_LOADING' });
    try {
      const result = await callAgent3(buildAgent3Request(state));
      dispatch({ type: 'AGENT3_SUCCESS', payload: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Agent 3 request failed.';
      dispatch({
        type: 'AGENT3_FAILED',
        payload: {
          message,
          retryable: err instanceof InterviewAdmissionError ? err.retryable : true,
        },
      });
    }
  }, [dispatch, state]);

  const handleNewSession = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, [dispatch]);

  const handlePracticeAgain = useCallback(() => {
    dispatch({ type: 'RETRY_INTERVIEW' });
  }, [dispatch]);

  switch (state.phase) {
    case 'upload':
      return <UploadScreen onSubmit={handleUploadSubmit} />;
    case 'waiting':
      return <WaitingRoom />;
    case 'interview':
      return <InterviewScreen wsClient={webSocketClient} />;
    case 'feedback':
      return (
        <FeedbackScreen
          loading={state.agent3Loading}
          error={state.phase === 'feedback' ? state.error : null}
          feedbackResult={state.feedbackResult}
          transcript={state.transcript}
          onRetry={handleFeedbackRetry}
          onNewSession={handleNewSession}
          onPracticeAgain={handlePracticeAgain}
        />
      );
    default:
      return null;
  }
}

function App() {
  return (
    <SessionProvider>
      <div className="app-root">
        <AppContent />
      </div>
      <style>{`
        :root {
          --color-canvas: #0A0A0A;
          --color-tile-bg: #1C1C1E;
          --color-control-bar: #2C2C2E;
          --color-text-primary: #FFFFFF;
          --color-text-secondary: #A0A0A5;
          --color-accent: #9AE05C;
          --color-error: #FF5C5C;
          --color-error-bg: rgba(255, 92, 92, 0.15);
        }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        html, body, #root {
          height: 100%;
          width: 100%;
        }

        body {
          background-color: var(--color-canvas);
          color: var(--color-text-primary);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .app-root {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
      `}</style>
    </SessionProvider>
  );
}

export default App;
