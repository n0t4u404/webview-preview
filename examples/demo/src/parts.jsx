import { useState } from "react";

const Sidebar = ({ current }) => (
	<aside className="sidebar">
		<div className="brand">Greenhouse</div>
		<nav className="nav">
			{["Plants", "Schedule", "Rooms", "Settings"].map(item => (
				<a
					key={item}
					href="#/"
					className={item === current ? "nav-link nav-link--current" : "nav-link"}
				>
					{item}
				</a>
			))}
		</nav>
	</aside>
);

const StatCard = ({ label, value, note }) => (
	<div className="stat">
		<span className="stat-label">{label}</span>
		<span className="stat-value">{value}</span>
		<span className="stat-note">{note}</span>
	</div>
);

const Tooltip = ({ text, children }) => {
	const [isShown, setIsShown] = useState(false);
	return (
		<span
			className="tooltip-anchor"
			onMouseEnter={() => setIsShown(true)}
			onMouseLeave={() => setIsShown(false)}
		>
			{children}
			{isShown && <span role="tooltip" className="tooltip">{text}</span>}
		</span>
	);
}

const PlantRow = ({ plant }) => (
	<li className="plant">
		<span className={plant.needsWater ? "dot dot--thirsty" : "dot"} />
		<div className="plant-text">
			<span className="plant-name">{plant.name}</span>
			<span className="plant-meta">{plant.room} · watered {plant.lastWatered.toLowerCase()}</span>
		</div>
		<Tooltip text={plant.needsWater ? "Soil is dry — 250 ml" : "Not needed yet"}>
			<button
				type="button"
				className={plant.needsWater ? "button button--primary" : "button"}
			>
				Water
			</button>
		</Tooltip>
	</li>
);

const ProfileCard = () => (
	<div className="profile">
		<div className="avatar">B</div>
		<div className="plant-text">
			<span className="plant-name">Bohdan</span>
			<span
				className="plant-meta"
				data-private
			>
				bohdan@example.com
			</span>
		</div>
	</div>
);

export const Greenhouse = { Sidebar, StatCard, Tooltip, PlantRow, ProfileCard }