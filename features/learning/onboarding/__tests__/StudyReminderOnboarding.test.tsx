import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import { StudyReminderOnboarding } from '../StudyReminderOnboarding';

function renderCard(permission: 'granted' | 'denied' | 'unsupported' = 'granted') {
  const onComplete = vi.fn();
  const requestPermission = vi.fn().mockResolvedValue(permission);
  render(
    <I18nProvider language="en">
      <StudyReminderOnboarding
        onComplete={onComplete}
        requestPermission={requestPermission}
      />
    </I18nProvider>,
  );
  return { onComplete, requestPermission };
}

describe('StudyReminderOnboarding', () => {
  it('enables reminders at the selected time after permission is granted', async () => {
    const { onComplete, requestPermission } = renderCard();
    // The desktop variant of the field: a tap target that opens hour and
    // minute columns, which is what jsdom reports (no coarse pointer).
    fireEvent.click(screen.getByRole('button', { name: /reminder time/i }));
    fireEvent.click(within(screen.getByRole('listbox', { name: /hours/i })).getByRole('option', { name: '20' }));
    fireEvent.click(within(screen.getByRole('listbox', { name: /minutes/i })).getByRole('option', { name: '15' }));
    fireEvent.click(screen.getByRole('button', { name: /enable reminders/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith({
      enabled: true,
      localMinutes: 20 * 60 + 15,
    }));
    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it('never prompts when the learner chooses not now', () => {
    const { onComplete, requestPermission } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));

    expect(requestPermission).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith({ enabled: false, localMinutes: 19 * 60 });
  });

  it('explains denial and then finishes without reminders', async () => {
    const { onComplete } = renderCard('denied');
    fireEvent.click(screen.getByRole('button', { name: /enable reminders/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('blocked');
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /continue without reminders/i }));
    expect(onComplete).toHaveBeenCalledWith({ enabled: false, localMinutes: 19 * 60 });
  });

  it('does not trap unsupported browsers', async () => {
    const { onComplete } = renderCard('unsupported');
    fireEvent.click(screen.getByRole('button', { name: /enable reminders/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('not available');
    fireEvent.click(screen.getByRole('button', { name: /continue without reminders/i }));
    expect(onComplete).toHaveBeenCalledWith({ enabled: false, localMinutes: 19 * 60 });
  });
});
