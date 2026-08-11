import { z } from 'zod';

const DevicePlatformSchema = z.enum([
  'ios',
  'android',
  'macos',
  'windows',
  'linux',
  'other',
  'unknown',
]);

const DeviceFormFactorSchema = z.enum([
  'mobile',
  'tablet',
  'desktop',
  'unknown',
]);

export const DeviceProfileSchema = z.object({
  platform: DevicePlatformSchema.optional(),
  formFactor: DeviceFormFactorSchema.optional(),
});

export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;
export type DeviceFormFactor = z.infer<typeof DeviceFormFactorSchema>;
export type DeviceProfile = z.infer<typeof DeviceProfileSchema>;
