import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/I18nProvider';
import {
  PhotoSourcePickerDialog,
  usesAndroidPhotoSourceChooser,
} from '../PhotoLabPage';

describe('photo lab source picker', () => {
  it('uses the explicit source chooser only on Android', () => {
    expect(usesAndroidPhotoSourceChooser('Mozilla/5.0 (Linux; Android 15)')).toBe(true);
    expect(usesAndroidPhotoSourceChooser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')).toBe(false);
  });

  it('offers camera and photo library actions', () => {
    const onCamera = vi.fn();
    const onLibrary = vi.fn();
    const onCancel = vi.fn();

    render(
      <I18nProvider language="en">
        <PhotoSourcePickerDialog
          onCamera={onCamera}
          onLibrary={onLibrary}
          onCancel={onCancel}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Take a photo/i }));
    fireEvent.click(screen.getByRole('button', { name: /Choose from library/i }));

    expect(onCamera).toHaveBeenCalledTimes(1);
    expect(onLibrary).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
