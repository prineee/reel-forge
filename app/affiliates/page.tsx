export default function AffiliatesPage() {
  return (
    <main className="min-h-screen bg-black text-white">

      {/* HERO */}
      <section className="max-w-7xl mx-auto px-6 py-16">

        <div className="grid lg:grid-cols-2 gap-10 items-center">

          <div>
            <h1 className="text-6xl font-bold mb-6">
              Promote <span className="text-orange-500">ReelForge</span>
            </h1>

            <p className="text-xl text-zinc-300 mb-8">
              Create AI Movies In Minutes.
              Earn high commissions by promoting one of the newest
              AI movie creation platforms.
            </p>

            <div className="flex gap-4 flex-wrap">

              <a
                href="https://www.jvzoo.com/affiliates/info/444419"
                target="_blank"
                className="bg-purple-600 hover:bg-purple-700 px-8 py-4 rounded-xl font-bold"
              >
                Become JVZoo Affiliate
              </a>

              <a
                href="https://reelforge.fabricaipro.com"
                target="_blank"
                className="border border-zinc-700 px-8 py-4 rounded-xl"
              >
                Visit Sales Page
              </a>

            </div>
          </div>

          <div>
            <img
              src="/screenshots/hero-image.png"
              alt="ReelForge"
              className="rounded-3xl shadow-2xl"
            />
          </div>

        </div>

      </section>

      {/* VIDEO */}

      <section className="max-w-6xl mx-auto px-6 py-20">

        <h2 className="text-5xl font-bold text-center mb-10">
          Watch ReelForge In Action
        </h2>

        <video
          controls
          className="w-full rounded-3xl border border-zinc-800"
        >
          <source
            src="/affiliate-promo-video/affiliate-promo.mp4"
            type="video/mp4"
          />
        </video>

      </section>

      {/* COMMISSION */}

      <section className="max-w-7xl mx-auto px-6 py-20">

        <h2 className="text-5xl font-bold text-center mb-12">
          Affiliate Commission
        </h2>

        <div className="grid md:grid-cols-3 gap-8">

          <div className="bg-zinc-900 p-8 rounded-3xl">
            <h3 className="text-3xl font-bold mb-3">50%</h3>
            <p>Front End Commission</p>
          </div>

          <div className="bg-zinc-900 p-8 rounded-3xl">
            <h3 className="text-3xl font-bold mb-3">Instant</h3>
            <p>JVZoo Tracking</p>
          </div>

          <div className="bg-zinc-900 p-8 rounded-3xl">
            <h3 className="text-3xl font-bold mb-3">High EPC</h3>
            <p>AI Software Niche</p>
          </div>

        </div>

      </section>

      {/* BANNERS */}

      <section className="max-w-7xl mx-auto px-6 py-20">

        <h2 className="text-5xl font-bold text-center mb-12">
          Promotional Assets
        </h2>

        <div className="grid md:grid-cols-2 gap-8">

          <div>
            <img
              src="/screenshots/banner-1200x630.png"
              className="rounded-2xl"
              alt=""
            />
          </div>

          <div>
            <img
              src="/screenshots/dashboard-mockup.png"
              className="rounded-2xl"
              alt=""
            />
          </div>

          <div>
            <img
              src="/screenshots/box-mockup.png"
              className="rounded-2xl"
              alt=""
            />
          </div>

          <div>
            <img
              src="/screenshots/logo.png"
              className="rounded-2xl"
              alt=""
            />
          </div>

        </div>

      </section>

      {/* EMAIL SWIPES */}

      <section className="max-w-5xl mx-auto px-6 py-20">

        <h2 className="text-5xl font-bold text-center mb-10">
          Affiliate Email Swipe
        </h2>

        <div className="bg-zinc-900 p-8 rounded-3xl">

          <p className="mb-4">
            Subject: Create AI Movies In Minutes
          </p>

          <p className="text-zinc-300 leading-8">
            Want to create stunning AI movies, animated films,
            AI dialogue videos and story-based content without
            expensive software?
            <br /><br />
            ReelForge makes it possible in minutes.
            <br /><br />
            Click Here:
            https://reelforge.fabricaipro.com
          </p>

        </div>

      </section>

      {/* CTA */}

      <section className="text-center py-24">

        <h2 className="text-6xl font-bold mb-8">
          Start Promoting ReelForge Today
        </h2>

        <a
          href="https://www.jvzoo.com/affiliates/info/444419"
          target="_blank"
          className="bg-orange-500 hover:bg-orange-600 px-10 py-5 rounded-xl text-xl font-bold"
        >
          Get Affiliate Link
        </a>

      </section>

    </main>
  );
}