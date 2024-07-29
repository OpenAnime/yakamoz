export default class Yakamoz extends EventTarget {
    parsedSegments;
    duration = 0;
    arrayOfBuffers = [];
    segmentLength = 0;
    currentSegment = 0;
    video;
    sourceBuffer;
    mime;

    #dispatch(eventName, detail) {
        this.dispatchEvent(new CustomEvent(eventName, { detail }));
    }

    #calculateTimestamp(segmentIndex) {
        return this.parsedSegments
            .slice(0, segmentIndex + 1)
            .reduce((acc, curr) => acc + curr.duration, 0);
    }

    #getSegmentUsingTimestamp(timestamp) {
        let calculatedDuration = 0;
        return (
            this.parsedSegments.find(
                (segment) => (calculatedDuration += segment.duration) >= timestamp,
            ) || null
        );
    }

    #ok() {
        let sourceBuffer,
            mediaSource = new MediaSource();

        const { video } = this;

        video.src = URL.createObjectURL(mediaSource);

        mediaSource.addEventListener('sourceopen', () => {
            sourceBuffer = mediaSource.addSourceBuffer(this.mime);
            mediaSource.duration = this.duration;
            sourceBuffer.timestampOffset = 0;

            sourceBuffer.addEventListener('updateend', appendToSourceBuffer);
            appendToSourceBuffer();
        });

        let isLoadingNextBuffer = false,
            bufferDeletionQueue = [];

        const checkBufferedRanges = async () => {
            if (sourceBuffer.buffered.length <= 0) return;

            let currentTime = video.currentTime;

            for (let i = 0; i < bufferDeletionQueue.length; i++) {
                const buf = bufferDeletionQueue[i];
                if (buf.time <= video.currentTime) {
                    buf.f();

                    bufferDeletionQueue = bufferDeletionQueue.filter((x) => x.time != buf.time);
                }
            }

            const nextSegmentStart =
                this.#calculateTimestamp(this?.currentSegment) -
                this.parsedSegments[this?.currentSegment]?.duration;

            // at the end of the video, nextSegmentStart will be NaN. isLoadingNextBuffer will be false, and the video will not seek to the next segment.

            if (
                currentTime >= nextSegmentStart - 2 &&
                Math.abs(nextSegmentStart - currentTime) <= 2
            ) {
                if (!(!isLoadingNextBuffer && this.currentSegment < this.segmentLength)) return;
                isLoadingNextBuffer = true;

                this.#dispatch('NEW_SEGMENT', {
                    targetSegment: this.currentSegment,
                    append: (buffer) => {
                        this.arrayOfBuffers.push({ buffer });
                        appendToSourceBuffer();
                    },
                });
            } else {
                isLoadingNextBuffer = false;
            }
        };

        const seeking = async () => {
            if (
                isLoadingNextBuffer ||
                (video.currentTime >= Math.floor(video.buffered.start(0)) &&
                    video.currentTime <= Math.floor(video.buffered.end(0)))
            )
                return;

            this.#dispatch('NEW_SEGMENT', {
                targetSegment: this.parsedSegments.indexOf(
                    this.#getSegmentUsingTimestamp(video.currentTime),
                ),
                append: (buffer) => {
                    this.arrayOfBuffers.push({ buffer });
                    if (mediaSource.readyState == 'open') {
                        sourceBuffer.abort();
                    }
                    appendToSourceBuffer();
                },
            });
        };

        const appendToSourceBuffer = () => {
            let s;

            if (
                !(
                    mediaSource.readyState === 'open' &&
                    sourceBuffer &&
                    sourceBuffer.updating === false
                ) ||
                !(s = this.arrayOfBuffers.shift())
            )
                return;

            sourceBuffer.appendBuffer(s.buffer);

            const getCurrent = this.#getSegmentUsingTimestamp(video.currentTime + 2);
            const i = this.parsedSegments.indexOf(getCurrent);
            this.currentSegment = i + 1;

            if (!video.buffered.length) return;

            bufferDeletionQueue.push({
                time: video.currentTime + 3,
                f: () => {
                    const calc = this.#calculateTimestamp(i - 1);
                    if (video.currentTime - calc > 2) return;

                    if (!sourceBuffer.updating) {
                        sourceBuffer.remove(0, calc);
                    } else {
                        sourceBuffer.addEventListener('updateend', function () {
                            sourceBuffer.remove(0, calc);
                            sourceBuffer.removeEventListener('updateend', this);
                        });
                    }
                },
            });
        };

        video.addEventListener('timeupdate', checkBufferedRanges);
        video.addEventListener('seeking', seeking);
    }

    init({ video, segments, mime }) {
        this.parsedSegments = segments;
        this.segmentLength = segments.length;
        this.video = video;
        this.mime = mime;

        this.duration += segments.reduce((acc, curr) => acc + curr.duration, 0);

        this.#dispatch('NEED_SOURCEBUFFER', {
            append: (buffer) => {
                this.arrayOfBuffers.push({ buffer });
                this.#ok();
            },
        });
    }
}
