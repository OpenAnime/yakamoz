export default class Yakamoz extends EventTarget {
    #parsedSegments = [];
    #duration = 0;
    #arrayOfBuffers = [];
    #segmentLength = 0;
    #currentSegment = 0;
    #video;
    #sourceBuffer;
    #mime;
    #mediaSource;
    #isLoadingNextBuffer = false;
    #bufferDeletionQueue = [];

    #dispatch(eventName, detail) {
        this.dispatchEvent(new CustomEvent(eventName, { detail }));
    }

    #calculateTimestamp(segmentIndex) {
        return this.#parsedSegments
            .slice(0, segmentIndex + 1)
            .reduce((acc, curr) => acc + curr.duration, 0);
    }

    #getSegmentUsingTimestamp(timestamp) {
        let calculatedDuration = 0;
        return this.#parsedSegments.find(
            (segment) => (calculatedDuration += segment.duration) >= timestamp
        ) ?? null;
    }

    #initializeMediaSource() {
        this.#mediaSource = new MediaSource();
        this.#video.src = URL.createObjectURL(this.#mediaSource);

        this.#mediaSource.addEventListener('sourceopen', () => {
            this.#sourceBuffer = this.#mediaSource.addSourceBuffer(this.#mime);
            this.#mediaSource.duration = this.#duration;
            this.#sourceBuffer.timestampOffset = 0;

            this.#sourceBuffer.addEventListener('updateend', () => this.#appendToSourceBuffer());
            this.#appendToSourceBuffer();
        });
    }

    #checkBufferedRanges() {
        if (this.#sourceBuffer.buffered.length <= 0) return;

        this.#processBufferDeletionQueue();
        this.#checkAndLoadNextSegment();
    };

    #processBufferDeletionQueue() {
        const currentTime = this.#video.currentTime;
        this.#bufferDeletionQueue = this.#bufferDeletionQueue.filter(buf => {
            if (buf.time <= currentTime) {
                buf.f();
                return false;
            }
            return true;
        });
    }

    #checkAndLoadNextSegment() {
        const currentTime = this.#video.currentTime;
        const nextSegmentStart = this.#calculateTimestamp(this.#currentSegment) -
            this.#parsedSegments[this.#currentSegment]?.duration;

        if (currentTime >= nextSegmentStart - 2 && Math.abs(nextSegmentStart - currentTime) <= 2) {
            if (!this.#isLoadingNextBuffer && this.#currentSegment < this.#segmentLength) {
                this.#isLoadingNextBuffer = true;
                this.#loadNewSegment(this.#currentSegment);
            }
        } else {
            this.#isLoadingNextBuffer = false;
        }
    }

    #loadNewSegment(targetSegment) {
        this.#dispatch('NEW_SEGMENT', {
            targetSegment,
            append: (buffer) => {
                this.#arrayOfBuffers.push({ buffer });
                this.#appendToSourceBuffer();
            },
        });
    }

    #seeking() {
        if (this.#isLoadingNextBuffer || this.#isCurrentTimeInBufferedRange()) return;

        const targetSegment = this.#parsedSegments.indexOf(
            this.#getSegmentUsingTimestamp(this.#video.currentTime)
        );
        this.#loadNewSegment(targetSegment);
    };

    #isCurrentTimeInBufferedRange() {
        const { currentTime, buffered } = this.#video;
        return currentTime >= Math.floor(buffered.start(0)) &&
            currentTime <= Math.floor(buffered.end(0));
    }

    #appendToSourceBuffer() {
        let buffer;
        if (!this.#canAppendBuffer() || !(buffer = this.#arrayOfBuffers.shift()?.buffer)) return;

        this.#sourceBuffer.appendBuffer(buffer);

        this.#updateCurrentSegment();
        this.#scheduleBufferDeletion();
    }

    #canAppendBuffer() {
        return this.#mediaSource.readyState === 'open' &&
            this.#sourceBuffer &&
            !this.#sourceBuffer.updating;
    }

    #updateCurrentSegment() {
        this.#currentSegment = this.#parsedSegments.indexOf(
            this.#getSegmentUsingTimestamp(this.#video.currentTime + 2)
        ) + 1;
    }

    #scheduleBufferDeletion() {
        this.#video.buffered.length && this.#bufferDeletionQueue.push({
            time: this.#video.currentTime + 3,
            f: () => this.#removeOldBuffer(this.#currentSegment - 1),
        });
    }

    #removeOldBuffer(currentSegmentIndex) {
        const calculatedTime = this.#calculateTimestamp(currentSegmentIndex - 1);
        if (this.#video.currentTime - calculatedTime > 2) return;

        if (!this.#sourceBuffer.updating) {
            this.#sourceBuffer.remove(0, calculatedTime);
        } else {
            const onUpdateEnd = () => {
                this.#sourceBuffer.remove(0, calculatedTime);
                this.#sourceBuffer.removeEventListener('updateend', onUpdateEnd);
            }
            this.#sourceBuffer.addEventListener('updateend', onUpdateEnd);
        }
    }

    init({ video, segments, mime }) {
        this.#parsedSegments = segments;
        this.#segmentLength = segments.length;
        this.#video = video;
        this.#mime = mime;

        this.#duration = segments.reduce((acc, curr) => acc + curr.duration, 0);

        this.#video.addEventListener('timeupdate', this.#checkBufferedRanges);
        this.#video.addEventListener('seeking', this.#seeking);

        this.#dispatch('NEED_SOURCEBUFFER', {
            append: (buffer) => {
                this.#arrayOfBuffers.push({ buffer });
                this.#initializeMediaSource();
            },
        });
    }
}
