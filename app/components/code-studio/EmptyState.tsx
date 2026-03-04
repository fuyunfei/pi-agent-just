"use client";

export function EmptyState() {
	return (
		<div
			className="flex flex-col items-center justify-center h-full px-8 text-center relative overflow-hidden"
			style={{ background: "radial-gradient(ellipse at 50% 40%, #F7F3EE 0%, #FAFAF8 40%, #F0EBE4 100%)" }}
		>
			{/* Deep field — massive slow orbits, barely visible */}
			<svg
				className="absolute inset-0 w-full h-full"
				viewBox="0 0 1600 1000"
				preserveAspectRatio="xMidYMid slice"
				style={{ opacity: 0.04 }}
			>
				<defs>
					<style>{`
						@keyframes es-deep-1 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
						@keyframes es-deep-2 { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
						.es-deep-1 { animation: es-deep-1 180s linear infinite; transform-origin: 800px 500px; }
						.es-deep-2 { animation: es-deep-2 240s linear infinite; transform-origin: 800px 500px; }
					`}</style>
				</defs>
				<g className="es-deep-1">
					<ellipse cx="800" cy="500" rx="700" ry="420" fill="none" stroke="#C07F5E" strokeWidth="0.4" />
					<ellipse cx="800" cy="500" rx="620" ry="350" fill="none" stroke="#9B8E7E" strokeWidth="0.3" strokeDasharray="4 30" />
				</g>
				<g className="es-deep-2">
					<ellipse cx="800" cy="500" rx="580" ry="480" fill="none" stroke="#9B8E7E" strokeWidth="0.3" />
					<ellipse cx="800" cy="500" rx="750" ry="300" fill="none" stroke="#C07F5E" strokeWidth="0.2" strokeDasharray="2 40" />
				</g>
			</svg>

			{/* Geodesic / AT-field layer — hexagonal grid lines, EVA-style technical overlay */}
			<svg
				className="absolute inset-0 w-full h-full"
				viewBox="0 0 800 600"
				preserveAspectRatio="xMidYMid slice"
				style={{ opacity: 0.055 }}
			>
				<defs>
					<style>{`
						@keyframes es-hex-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
						@keyframes es-hex-spin-r { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
						@keyframes es-hex-pulse { 0%, 100% { opacity: 0.4; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.02); } }
						.es-hex-1 { animation: es-hex-spin 60s linear infinite; transform-origin: 400px 300px; }
						.es-hex-2 { animation: es-hex-spin-r 80s linear infinite; transform-origin: 400px 300px; }
						.es-hex-pulse { animation: es-hex-pulse 5s ease-in-out infinite; transform-origin: 400px 300px; }
					`}</style>
				</defs>

				{/* Concentric hexagons */}
				<g className="es-hex-1">
					<polygon points="400,100 660,150 660,450 400,500 140,450 140,150" fill="none" stroke="#C07F5E" strokeWidth="0.6" />
					<polygon points="400,140 620,180 620,420 400,460 180,420 180,180" fill="none" stroke="#9B8E7E" strokeWidth="0.4" strokeDasharray="10 15" />
				</g>
				<g className="es-hex-2">
					<polygon points="400,170 570,200 570,400 400,430 230,400 230,200" fill="none" stroke="#C07F5E" strokeWidth="0.5" strokeDasharray="6 20" />
				</g>
				<g className="es-hex-pulse">
					<polygon points="400,210 520,235 520,365 400,390 280,365 280,235" fill="none" stroke="#9B8E7E" strokeWidth="0.5" />
				</g>

				{/* Radial spokes from center — technical crosshair feel */}
				{[0, 60, 120, 180, 240, 300].map((angle) => (
					<line
						key={angle}
						x1="400" y1="300"
						x2={400 + Math.cos(angle * Math.PI / 180) * 260}
						y2={300 + Math.sin(angle * Math.PI / 180) * 260}
						stroke="#9B8E7E" strokeWidth="0.3" strokeDasharray="3 12"
					/>
				))}
			</svg>

			{/* Mid orbit layer — rings + tracing arcs */}
			<svg
				className="absolute inset-0 w-full h-full"
				viewBox="0 0 800 600"
				preserveAspectRatio="xMidYMid slice"
				style={{ opacity: 0.09 }}
			>
				<defs>
					<style>{`
						@keyframes es-ring-a { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
						@keyframes es-ring-b { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
						@keyframes es-arc-trace { 0% { stroke-dashoffset: 500; } 50% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -500; } }
						@keyframes es-breathe { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }
						.es-ring-a { animation: es-ring-a 25s linear infinite; transform-origin: 400px 300px; }
						.es-ring-b { animation: es-ring-b 35s linear infinite; transform-origin: 400px 300px; }
						.es-arc { animation: es-arc-trace 7s ease-in-out infinite; }
						.es-glow { animation: es-breathe 4s ease-in-out infinite; }
					`}</style>
				</defs>

				<g className="es-ring-a">
					<circle cx="400" cy="300" r="195" fill="none" stroke="#C07F5E" strokeWidth="0.7" strokeDasharray="16 20" />
					<circle cx="400" cy="300" r="165" fill="none" stroke="#9B8E7E" strokeWidth="0.4" strokeDasharray="3 14" />
				</g>
				<g className="es-ring-b">
					<circle cx="400" cy="300" r="130" fill="none" stroke="#C07F5E" strokeWidth="0.5" strokeDasharray="8 25" />
				</g>

				{/* Breathing core ring */}
				<circle cx="400" cy="300" r="85" fill="none" stroke="#C07F5E" strokeWidth="0.4" className="es-glow" />

				{/* Tracing arcs — asymmetric for dynamism */}
				<path d="M 250 150 A 210 210 0 0 1 550 150" fill="none" stroke="#C07F5E" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="280" className="es-arc" />
				<path d="M 550 450 A 210 210 0 0 1 250 450" fill="none" stroke="#9B8E7E" strokeWidth="0.9" strokeLinecap="round" strokeDasharray="280" className="es-arc" style={{ animationDelay: "-3.5s" }} />
				<path d="M 160 350 A 250 250 0 0 1 400 70" fill="none" stroke="#C07F5E" strokeWidth="0.7" strokeLinecap="round" strokeDasharray="350" className="es-arc" style={{ animationDelay: "-1.5s" }} />
				<path d="M 640 250 A 250 250 0 0 1 400 530" fill="none" stroke="#9B8E7E" strokeWidth="0.6" strokeLinecap="round" strokeDasharray="350" className="es-arc" style={{ animationDelay: "-5s" }} />
			</svg>

			{/* Near detail layer — particles, shapes, technical marks */}
			<svg
				className="absolute inset-0 w-full h-full"
				viewBox="0 0 800 600"
				preserveAspectRatio="xMidYMid slice"
				style={{ opacity: 0.13 }}
			>
				<defs>
					<style>{`
						@keyframes es-particle-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
						@keyframes es-particle-orbit-r { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
						@keyframes es-drift { 0%, 100% { transform: translateY(0) translateX(0); } 33% { transform: translateY(-8px) translateX(4px); } 66% { transform: translateY(4px) translateX(-6px); } }
						@keyframes es-tick { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.9; } }
						@keyframes es-scan { from { stroke-dashoffset: 300; } to { stroke-dashoffset: 0; } }
						.es-orb-fast { animation: es-particle-orbit 10s linear infinite; transform-origin: 400px 300px; }
						.es-orb-med { animation: es-particle-orbit-r 16s linear infinite; transform-origin: 400px 300px; }
						.es-drift { animation: es-drift 6s ease-in-out infinite; }
						.es-tick { animation: es-tick 3s ease-in-out infinite; }
						.es-scan { animation: es-scan 2s ease-out forwards; }
					`}</style>
				</defs>

				{/* Fast orbiting particles */}
				<g className="es-orb-fast">
					<circle cx="400" cy="190" r="2" fill="#C07F5E" />
					<circle cx="310" cy="400" r="1.5" fill="#C07F5E" opacity="0.7" />
					<circle cx="490" cy="380" r="1.8" fill="#9B8E7E" />
				</g>
				<g className="es-orb-med">
					<circle cx="400" cy="160" r="1.2" fill="#9B8E7E" />
					<circle cx="260" cy="340" r="2.2" fill="#C07F5E" opacity="0.6" />
					<circle cx="540" cy="320" r="1" fill="#9B8E7E" opacity="0.8" />
				</g>

				{/* Drifting geometric shapes */}
				<g className="es-drift">
					<rect x="610" y="170" width="10" height="10" rx="1.5" fill="none" stroke="#C07F5E" strokeWidth="0.7" transform="rotate(45 615 175)" />
				</g>
				<g className="es-drift" style={{ animationDelay: "-2s" }}>
					<rect x="155" y="210" width="8" height="8" rx="1" fill="none" stroke="#9B8E7E" strokeWidth="0.6" transform="rotate(30 159 214)" />
				</g>
				<g className="es-drift" style={{ animationDelay: "-4s" }}>
					<polygon points="660,400 667,414 653,414" fill="none" stroke="#C07F5E" strokeWidth="0.7" />
				</g>
				<g className="es-drift" style={{ animationDelay: "-1s" }}>
					<polygon points="145,430 152,444 138,444" fill="none" stroke="#9B8E7E" strokeWidth="0.6" />
				</g>
				<g className="es-drift" style={{ animationDelay: "-3s" }}>
					<circle cx="640" cy="170" r="4" fill="none" stroke="#9B8E7E" strokeWidth="0.6" />
				</g>

				{/* Technical tick marks around center — EVA HUD feel */}
				{[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
					const r1 = 75, r2 = 82;
					const x1 = 400 + Math.cos(angle * Math.PI / 180) * r1;
					const y1 = 300 + Math.sin(angle * Math.PI / 180) * r1;
					const x2 = 400 + Math.cos(angle * Math.PI / 180) * r2;
					const y2 = 300 + Math.sin(angle * Math.PI / 180) * r2;
					return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#C07F5E" strokeWidth="0.6" className="es-tick" style={{ animationDelay: `${angle / 360 * 3}s` }} />;
				})}

				{/* Scan lines — draw in once */}
				<line x1="180" y1="520" x2="340" y2="370" stroke="#C07F5E" strokeWidth="0.35" strokeDasharray="300" className="es-scan" style={{ animationDelay: "0.3s" }} />
				<line x1="620" y1="80" x2="460" y2="230" stroke="#9B8E7E" strokeWidth="0.35" strokeDasharray="300" className="es-scan" style={{ animationDelay: "0.7s" }} />
				<line x1="700" y1="470" x2="520" y2="350" stroke="#C07F5E" strokeWidth="0.3" strokeDasharray="300" className="es-scan" style={{ animationDelay: "1.1s" }} />
				<line x1="100" y1="130" x2="280" y2="250" stroke="#9B8E7E" strokeWidth="0.3" strokeDasharray="300" className="es-scan" style={{ animationDelay: "1.5s" }} />

				{/* Center crosshair — precise, technical */}
				<line x1="388" y1="300" x2="396" y2="300" stroke="#C07F5E" strokeWidth="0.5" className="es-tick" />
				<line x1="404" y1="300" x2="412" y2="300" stroke="#C07F5E" strokeWidth="0.5" className="es-tick" />
				<line x1="400" y1="288" x2="400" y2="296" stroke="#C07F5E" strokeWidth="0.5" className="es-tick" />
				<line x1="400" y1="304" x2="400" y2="312" stroke="#C07F5E" strokeWidth="0.5" className="es-tick" />
			</svg>

			{/* Content — on top of SVG */}
			<div className="flex flex-col items-center gap-6 relative z-10">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src="/logo-horizontal-clay.svg" alt="PageOn" style={{ height: 96 }} />

				<p style={{ fontFamily: "'Noto Serif', serif", color: "#9B8E7E", fontSize: 14, fontStyle: "italic", letterSpacing: "0.02em" }}>
					Render what you envision
				</p>
			</div>
		</div>
	);
}
