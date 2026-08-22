import { notFound } from 'next/navigation';

export default function MobileOnboardingDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="flex min-h-screen items-start justify-center bg-[#060A18] p-4 sm:p-8">
      <div className="overflow-hidden rounded-[2rem] border-8 border-[#20283A] bg-[#F4EFE2] shadow-2xl">
        <iframe
          title="Mobilní onboarding náhled"
          src="/dev/onboarding/goal"
          className="block h-[844px] w-[390px] max-w-[calc(100vw-2rem)] border-0"
        />
      </div>
    </main>
  );
}
