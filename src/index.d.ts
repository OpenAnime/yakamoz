declare class Yakamoz extends EventTarget {
    constructor();

    init(options: {
        video: HTMLVideoElement;
        segments: { duration: number }[];
        mime: string;
    }): void;

    addEventListener(type: 'NEW_SEGMENT', listener: (event: CustomEvent<{
        targetSegment: number;
        append: (buffer: ArrayBuffer) => void;
    }>) => void, options?: boolean | AddEventListenerOptions): void;

    addEventListener(type: 'NEED_SOURCEBUFFER', listener: (event: CustomEvent<{
        append: (buffer: ArrayBuffer) => void;
    }>) => void, options?: boolean | AddEventListenerOptions): void;

    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;

    removeEventListener(type: 'NEW_SEGMENT', listener: (event: CustomEvent<{
        targetSegment: number;
        append: (buffer: ArrayBuffer) => void;
    }>) => void, options?: boolean | EventListenerOptions): void;

    removeEventListener(type: 'NEED_SOURCEBUFFER', listener: (event: CustomEvent<{
        append: (buffer: ArrayBuffer) => void;
    }>) => void, options?: boolean | EventListenerOptions): void;

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;

    dispatchEvent(event: Event): boolean;
}

export default Yakamoz;
