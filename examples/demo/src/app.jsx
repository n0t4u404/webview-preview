import { PLANTS } from "./data.js";
import { Greenhouse } from "./parts.jsx";

export const App = () => {
	const thirsty = PLANTS.filter(plant => plant.needsWater);
	return (
		<div className="app">
			<Greenhouse.Sidebar current="Plants" />
			<main className="main">
				<header className="header">
					<h1>Plants</h1>
					<Greenhouse.ProfileCard />
				</header>
				<section className="stats">
					<Greenhouse.StatCard
						label="Plants"
						value={PLANTS.length}
						note="in 5 rooms"
					/>
					<Greenhouse.StatCard
						label="Need water"
						value={thirsty.length}
						note="today"
					/>
					<Greenhouse.StatCard
						label="Next round"
						value="18:00"
						note="living room first"
					/>
				</section>
				<ul className="plants">
					{PLANTS.map(plant => (
						<Greenhouse.PlantRow
							key={plant.id}
							plant={plant}
						/>
					))}
				</ul>
			</main>
		</div>
	);
}