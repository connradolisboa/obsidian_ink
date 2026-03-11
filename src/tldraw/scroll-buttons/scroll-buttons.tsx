import * as React from 'react';
import './scroll-buttons.scss';

///////////
///////////

export const ScrollButtons: React.FC = () => {
	const selfRef = React.useRef<HTMLDivElement>(null);

	function getScrollContainer(): HTMLElement | null {
		return (selfRef.current?.closest('.cm-scroller') as HTMLElement) ?? null;
	}

	function scrollUp(e: React.PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		const container = getScrollContainer();
		if (container) {
			container.scrollBy({ top: -(container.clientHeight * 0.8) });
		}
	}

	function scrollDown(e: React.PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		const container = getScrollContainer();
		if (container) {
			container.scrollBy({ top: container.clientHeight * 0.8 });
		}
	}

	return (
		<div ref={selfRef} className="ink_scroll-buttons">
			<button
				className="ink_scroll-button"
				onPointerDown={scrollUp}
				aria-label="Scroll up"
			>
				{/* Arrow up — Material Symbols Rounded */}
				<svg xmlns="http://www.w3.org/2000/svg" height={24} viewBox="0 -960 960 960" width={24}>
					<path d="M440-160q-17 0-28.5-11.5T400-200v-447L244-491q-11 11-28 11t-28-11q-11-11-11-28t11-28l264-264q6-6 13-8.5t15-2.5q8 0 15 2.5t13 8.5l264 264q11 11 11 28t-11 28q-11 11-28 11t-28-11L560-647v447q0 17-11.5 28.5T520-160h-80Z" />
				</svg>
			</button>
			<button
				className="ink_scroll-button"
				onPointerDown={scrollDown}
				aria-label="Scroll down"
			>
				{/* Arrow down — Material Symbols Rounded */}
				<svg xmlns="http://www.w3.org/2000/svg" height={24} viewBox="0 -960 960 960" width={24}>
					<path d="M440-800q17 0 28.5 11.5T480-760v447l156-156q11-11 28-11t28 11q11 11 11 28t-11 28L428-149q-6 6-13 8.5t-15 2.5q-8 0-15-2.5t-13-8.5L108-413q-11-11-11-28t11-28q11-11 28-11t28 11l156 156v-447q0-17 11.5-28.5T360-800h80Z" />
				</svg>
			</button>
		</div>
	);
};
