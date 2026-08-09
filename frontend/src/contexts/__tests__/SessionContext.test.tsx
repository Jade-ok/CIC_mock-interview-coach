import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionProvider, useSession } from '@/contexts/SessionContext';

function ReconnectHarness({ client }: { client: any }) {
  const { dispatch, setWebSocketClient } = useSession();

  return (
    <>
      <button type="button" onClick={() => setWebSocketClient(client)}>set client</button>
      <button
        type="button"
        onClick={() => dispatch({
          type: 'AGENT1_SUCCESS',
          payload: { nova_sonic_context: 'context' },
        })}
      >
        analyst ready
      </button>
      <button type="button" onClick={() => dispatch({ type: 'WS_CONNECTED' })}>
        connected
      </button>
      <button
        type="button"
        onClick={() => dispatch({ type: 'WS_DISCONNECTED', payload: { reason: 'network' } })}
      >
        disconnected
      </button>
      <button type="button" onClick={() => dispatch({ type: 'WS_RECONNECT_SUCCESS' })}>
        reconnected
      </button>
    </>
  );
}

describe('SessionProvider reconnect coordination', () => {
  it('starts the fresh Nova session after WebSocket reconnection', async () => {
    const sendSessionStart = vi.fn().mockResolvedValue(undefined);
    const client = { sendSessionStart };

    render(
      <SessionProvider>
        <ReconnectHarness client={client} />
      </SessionProvider>
    );

    fireEvent.click(screen.getByText('set client'));
    fireEvent.click(screen.getByText('analyst ready'));
    fireEvent.click(screen.getByText('connected'));
    await waitFor(() => expect(sendSessionStart).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('disconnected'));
    fireEvent.click(screen.getByText('reconnected'));
    await waitFor(() => expect(sendSessionStart).toHaveBeenCalledTimes(2));
  });
});
