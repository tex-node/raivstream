export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
      <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
          Raiv<span className="text-pink-500">stream</span>
        </h1>
        <p className="text-2xl text-white/70">
          Premium short-form vertical video streaming
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8">
          <div className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20">
            <h3 className="text-2xl font-bold">For Viewers →</h3>
            <div className="text-lg">
              Discover amazing content with personalized recommendations
            </div>
          </div>
          <div className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20">
            <h3 className="text-2xl font-bold">For Creators →</h3>
            <div className="text-lg">
              Share your creativity and monetize your content
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
