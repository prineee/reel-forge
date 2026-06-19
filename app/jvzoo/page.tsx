export default function JVZooPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-6 py-20">

        <h1 className="text-5xl font-bold mb-6">
          ReelForge AI Movie Studio
        </h1>

        <p className="text-xl text-gray-300 mb-10">
          Create AI Movies, Cartoon Stories, Talking Character Videos,
          Cinematic Films and Viral Content in Minutes.
        </p>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="border border-gray-800 p-6 rounded-xl">
            <h3 className="font-bold text-xl mb-2">AI Movie Studio</h3>
            <p>Create complete AI films from simple ideas.</p>
          </div>

          <div className="border border-gray-800 p-6 rounded-xl">
            <h3 className="font-bold text-xl mb-2">Cartoon Studio</h3>
            <p>Generate animated stories with AI characters.</p>
          </div>

          <div className="border border-gray-800 p-6 rounded-xl">
            <h3 className="font-bold text-xl mb-2">Talking Characters</h3>
            <p>Create dialogue videos with realistic voices.</p>
          </div>
        </div>

        {/* JVZoo Button Area */}

        <div className="text-center my-12">

          <h2 className="text-3xl font-bold mb-6">
            Get Instant Access
          </h2>

        <img src="https://i.jvzoo.com/0/444419/99" 
        alt="JVZoo Tracking Pixel" 
        width={1}
         height={1} 
         />
                </div>

        <div className="mt-16 text-sm text-gray-400 leading-7">

          <h3 className="text-xl text-white font-bold mb-4">
            Disclaimer
          </h3>

          <p>
            Please note that this product does not provide any guarantee
            of income or success. The results achieved by the product
            owner or any other individuals mentioned are not indicative
            of future success or earnings.
          </p>

          <br />

          <p>
            JVZoo serves as the retailer for the products featured on
            this site. JVZoo® is a registered trademark of BBC Systems
            Inc. The role of JVZoo as a retailer does not constitute an
            endorsement, approval, or review of these products.
          </p>

        </div>

      </div>
    </main>
  )
}