import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PanGestureHandler, PinchGestureHandler, State } from 'react-native-gesture-handler';
import Animated, { EasingNode } from 'react-native-reanimated';

import { ImageComponent } from './ImageComponent';
import { themes } from '../../lib/constants';
import { TSupportedThemes } from '../../theme';

const styles = StyleSheet.create({
	flex: {
		flex: 1
	},
	image: {
		backgroundColor: 'transparent'
	}
});

const {
	set,
	cond,
	eq,
	or,
	add,
	sub,
	min,
	max,
	multiply,
	divide,
	lessThan,
	decay,
	timing,
	diff,
	not,
	abs,
	startClock,
	stopClock,
	clockRunning,
	Value,
	Clock,
	event
} = Animated;

function scaleDiff(value: any) {
	const tmp = new Value(1);
	const prev = new Value(1);
	return [set(tmp, divide(value, prev)), set(prev, value), tmp];
}

function dragDiff(value: any, updating: any) {
	const tmp = new Value(0);
	const prev = new Value(0);
	return cond(updating, [set(tmp, sub(value, prev)), set(prev, value), tmp], set(prev, 0));
}

// returns linear friction coeff. When `value` is 0 coeff is 1 (no friction), then
// it grows linearly until it reaches `MAX_FRICTION` when `value` is equal
// to `MAX_VALUE`
function friction(value: any) {
	const MAX_FRICTION = 5;
	const MAX_VALUE = 100;
	return max(1, min(MAX_FRICTION, add(1, multiply(value, (MAX_FRICTION - 1) / MAX_VALUE))));
}

function speed(value: any) {
	const clock = new Clock();
	const dt = diff(clock);
	return cond(lessThan(dt, 1), 0, multiply(1000, divide(diff(value), dt)));
}

const MIN_SCALE = 1;
const MAX_SCALE = 2;

function scaleRest(value: any) {
	return cond(lessThan(value, MIN_SCALE), MIN_SCALE, cond(lessThan(MAX_SCALE, value), MAX_SCALE, value));
}

function scaleFriction(value: any, rest: any, delta: any) {
	const MAX_FRICTION = 20;
	const MAX_VALUE = 0.5;
	const res = multiply(value, delta);
	const howFar = abs(sub(rest, value));
	const f = max(1, min(MAX_FRICTION, add(1, multiply(howFar, (MAX_FRICTION - 1) / MAX_VALUE))));
	return cond(lessThan(0, howFar), multiply(value, add(1, divide(add(delta, -1), f))), res);
}

function runTiming(clock: any, value: any, dest: any, startStopClock: any = true) {
	const state = {
		finished: new Value(0),
		position: new Value(0),
		frameTime: new Value(0),
		time: new Value(0)
	};

	const config = {
		toValue: new Value(0),
		duration: 300,
		easing: EasingNode.inOut(EasingNode.cubic)
	};

	return [
		cond(clockRunning(clock), 0, [
			set(state.finished, 0),
			set(state.frameTime, 0),
			set(state.time, 0),
			set(state.position, value),
			set(config.toValue, dest),
			startStopClock && startClock(clock)
		]),
		timing(clock, state, config),
		cond(state.finished, startStopClock && stopClock(clock)),
		state.position
	];
}

function runDecay(clock: any, value: any, velocity: any) {
	const state = {
		finished: new Value(0),
		velocity: new Value(0),
		position: new Value(0),
		time: new Value(0)
	};

	const config = { deceleration: 0.99 };

	return [
		cond(clockRunning(clock), 0, [
			set(state.finished, 0),
			set(state.velocity, velocity),
			set(state.position, value),
			set(state.time, 0),
			startClock(clock)
		]),
		set(state.position, value),
		decay(clock, state, config),
		cond(state.finished, stopClock(clock)),
		state.position
	];
}

function bouncyPinch(
	value: any,
	gesture: any,
	gestureActive: any,
	focalX: any,
	displacementX: any,
	focalY: any,
	displacementY: any
) {
	const clock = new Clock();

	const delta = scaleDiff(gesture);
	const rest = scaleRest(value);
	const focalXRest = cond(lessThan(value, 1), 0, sub(displacementX, multiply(focalX, add(-1, divide(rest, value)))));
	const focalYRest = cond(lessThan(value, 1), 0, sub(displacementY, multiply(focalY, add(-1, divide(rest, value)))));
	const nextScale = new Value(1);

	return cond(
		[delta, gestureActive],
		[
			stopClock(clock),
			set(nextScale, scaleFriction(value, rest, delta)),
			set(displacementX, sub(displacementX, multiply(focalX, add(-1, divide(nextScale, value))))),
			set(displacementY, sub(displacementY, multiply(focalY, add(-1, divide(nextScale, value))))),
			nextScale
		],
		cond(
			or(clockRunning(clock), not(eq(rest, value))),
			[
				set(displacementX, runTiming(clock, displacementX, focalXRest, false)),
				set(displacementY, runTiming(clock, displacementY, focalYRest, false)),
				runTiming(clock, value, rest)
			],
			value
		)
	);
}

function bouncy(value: any, gestureDiv: any, gestureActive: any, lowerBound: any, upperBound: any, f: any) {
	const timingClock = new Clock();
	const decayClock = new Clock();

	const velocity = speed(value);

	// did value go beyond the limits (lower, upper)
	const isOutOfBounds = or(lessThan(value, lowerBound), lessThan(upperBound, value));
	// position to snap to (upper or lower is beyond or the current value elsewhere)
	const rest = cond(lessThan(value, lowerBound), lowerBound, cond(lessThan(upperBound, value), upperBound, value));
	// how much the value exceeds the bounds, this is used to calculate friction
	const outOfBounds = abs(sub(rest, value));

	return cond(
		[gestureDiv, velocity, gestureActive],
		[stopClock(timingClock), stopClock(decayClock), add(value, divide(gestureDiv, f(outOfBounds)))],
		cond(
			or(clockRunning(timingClock), isOutOfBounds),
			[stopClock(decayClock), runTiming(timingClock, value, rest)],
			cond(or(clockRunning(decayClock), lessThan(5, abs(velocity))), runDecay(decayClock, value, velocity), value)
		)
	);
}

const WIDTH = 300;
const HEIGHT = 300;

interface IImageProps {
	imageComponentType: string;
}

class Image extends React.PureComponent<IImageProps, any> {
	render() {
		const { imageComponentType }: any = this.props;

		const Component = ImageComponent(imageComponentType);

		return <Component {...this.props} />;
	}
}

// https://github.com/software-mansion/react-native-reanimated/issues/1717
const AnimatedImage: any = Animated.createAnimatedComponent(Image);

// it was picked from https://github.com/software-mansion/react-native-reanimated/tree/master/Example/imageViewer
// and changed to use FastImage animated component

interface IImageViewerProps {
	uri: string;
	width: number;
	height: number;
	theme: TSupportedThemes;
	imageComponentType: string;
}

export class ImageViewer extends React.Component<IImageViewerProps, any> {
	private _onPinchEvent: any;

	private _focalDisplacementX: any;

	private _focalDisplacementY: any;

	private _scale: any;

	private _onPanEvent: any;

	private _panTransX: any;

	private _panTransY: any;

	constructor(props: IImageViewerProps) {
		super(props);

		// DECLARE TRANSX
		const panTransX = new Value(0);
		const panTransY = new Value(0);

		// PINCH
		const pinchScale = new Value(1);
		const pinchFocalX = new Value(0);
		const pinchFocalY = new Value(0);
		const pinchState = new Value(-1);

		this._onPinchEvent = event([
			{
				nativeEvent: {
					state: pinchState,
					scale: pinchScale,
					focalX: pinchFocalX,
					focalY: pinchFocalY
				}
			}
		]);

		// SCALE
		const scale = new Value(1);
		const pinchActive = eq(pinchState, State.ACTIVE);
		this._focalDisplacementX = new Value(0);
		const relativeFocalX = sub(pinchFocalX, add(panTransX, this._focalDisplacementX));
		this._focalDisplacementY = new Value(0);
		const relativeFocalY = sub(pinchFocalY, add(panTransY, this._focalDisplacementY));
		this._scale = set(
			scale,
			bouncyPinch(
				scale,
				pinchScale,
				pinchActive,
				relativeFocalX,
				this._focalDisplacementX,
				relativeFocalY,
				this._focalDisplacementY
			)
		);

		// PAN
		const dragX = new Value(0);
		const dragY = new Value(0);
		const panState = new Value(-1);
		this._onPanEvent = event([
			{
				nativeEvent: {
					translationX: dragX,
					translationY: dragY,
					state: panState
				}
			}
		]);

		const panActive = eq(panState, State.ACTIVE);
		const panFriction = (value: any) => friction(value);

		// X
		const panUpX = cond(lessThan(this._scale, 1), 0, multiply(-1, this._focalDisplacementX));
		const panLowX = add(panUpX, multiply(-WIDTH, add(max(1, this._scale), -1)));
		this._panTransX = set(
			panTransX,
			bouncy(panTransX, dragDiff(dragX, panActive), or(panActive, pinchActive), panLowX, panUpX, panFriction)
		);

		// Y
		const panUpY = cond(lessThan(this._scale, 1), 0, multiply(-1, this._focalDisplacementY));
		const panLowY = add(panUpY, multiply(-HEIGHT, add(max(1, this._scale), -1)));
		this._panTransY = set(
			panTransY,
			bouncy(panTransY, dragDiff(dragY, panActive), or(panActive, pinchActive), panLowY, panUpY, panFriction)
		);
	}

	pinchRef = React.createRef();

	panRef = React.createRef();

	render() {
		const { uri, width, height, imageComponentType, theme, ...props } = this.props;

		// The below two animated values makes it so that scale appears to be done
		// from the top left corner of the image view instead of its center. This
		// is required for the "scale focal point" math to work correctly
		const scaleTopLeftFixX = divide(multiply(WIDTH, add(this._scale, -1)), 2);
		const scaleTopLeftFixY = divide(multiply(HEIGHT, add(this._scale, -1)), 2);
		const backgroundColor = themes[theme].previewBackground;

		return (
			<View style={[styles.flex, { width, height, backgroundColor }]}>
				<PinchGestureHandler
					ref={this.pinchRef}
					simultaneousHandlers={this.panRef}
					onGestureEvent={this._onPinchEvent}
					onHandlerStateChange={this._onPinchEvent}>
					<Animated.View>
						<PanGestureHandler
							ref={this.panRef}
							minDist={10}
							avgTouches
							simultaneousHandlers={this.pinchRef}
							onGestureEvent={this._onPanEvent}
							onHandlerStateChange={this._onPanEvent}>
							<AnimatedImage
								style={[
									styles.image,
									{
										width,
										height: '100%'
									},
									{
										transform: [
											{ translateX: this._panTransX },
											{ translateY: this._panTransY },
											{ translateX: this._focalDisplacementX },
											{ translateY: this._focalDisplacementY },
											{ translateX: scaleTopLeftFixX },
											{ translateY: scaleTopLeftFixY },
											{ scale: this._scale }
										]
									}
								]}
								imageComponentType={imageComponentType}
								resizeMode='contain'
								source={{ uri }}
								{...props}
							/>
						</PanGestureHandler>
					</Animated.View>
				</PinchGestureHandler>
			</View>
		);
	}
}
