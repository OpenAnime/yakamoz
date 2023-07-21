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
    const event = new CustomEvent(eventName, { detail });
    this.dispatchEvent(event);
  }

  #calculateTimestamp(segmentIndex) {
    let timestamp = 0;
    for (let index = 0; index < segmentIndex + 1; index++) {
      const element = this.parsedSegments[index];
      timestamp += element.duration;
    }
    return timestamp;
  }

  #getSegmentUsingTimestamp(timestamp) {
    let calculatedDuration = 0;
    let segment;
    for (let index = 0; index < this.parsedSegments.length; index++) {
      const element = this.parsedSegments[index];
      calculatedDuration += element.duration;
      if (calculatedDuration >= timestamp) {
        segment = element;
        break;
      }
    }
    return segment;
  }

  #ok() {
    let sourceBuffer;
    let mediaSource = new MediaSource();

    let url = URL.createObjectURL(mediaSource);
    const video = this.video;

    video.src = url;

    mediaSource.addEventListener("sourceopen", () => {
      sourceBuffer = mediaSource.addSourceBuffer(this.mime);
      mediaSource.duration = this.duration;
      sourceBuffer.timestampOffset = 0;

      sourceBuffer.addEventListener("updateend", appendToSourceBuffer);
      appendToSourceBuffer();
    });

    let isLoadingNextBuffer = false;
    let bufferDeletionQueue = [];

    const checkBufferedRanges = async () => {
      if (sourceBuffer.buffered.length > 0) {
        let currentTime = video.currentTime;

        const gereksizBufferlar = bufferDeletionQueue.filter(
          (x) => x.time <= video.currentTime
        );
        gereksizBufferlar.forEach((buf) => {
          buf.f();
          bufferDeletionQueue = bufferDeletionQueue.filter(
            (x) => x.time != buf.time
          );
        });

        const nextSegmentStart =
          this.#calculateTimestamp(this.currentSegment) -
          this.parsedSegments[this.currentSegment].duration;

        if (
          currentTime >= nextSegmentStart - 2 &&
          Math.abs(nextSegmentStart - currentTime) <= 2
        ) {
          if (
            !isLoadingNextBuffer &&
            this.currentSegment < this.segmentLength
          ) {
            isLoadingNextBuffer = true;

            this.#dispatch("NEW_SEGMENT", {
              targetSegment: this.currentSegment,
              append: (buffer) => {
                this.arrayOfBuffers.push({ buffer });
                appendToSourceBuffer();
              },
            });
          }
        } else {
          isLoadingNextBuffer = false;
        }
      }
    };

    const seeking = async () => {
      if (!isLoadingNextBuffer) {
        const start = Math.floor(video.buffered.start(0));
        const end = Math.floor(video.buffered.end(0));
        if (!(video.currentTime >= start && video.currentTime <= end)) {
          const calc = this.#getSegmentUsingTimestamp(video.currentTime);
          const i = this.parsedSegments.indexOf(calc);

          this.#dispatch("NEW_SEGMENT", {
            targetSegment: i,
            append: (buffer) => {
              this.arrayOfBuffers.push({ buffer });
              if (mediaSource.readyState == "open") {
                sourceBuffer.abort();
              }
              appendToSourceBuffer();
            },
          });
        }
      }
    };

    const appendToSourceBuffer = () => {
      if (
        mediaSource.readyState === "open" &&
        sourceBuffer &&
        sourceBuffer.updating === false
      ) {
        const s = this.arrayOfBuffers.shift();
        if (s) {
          sourceBuffer.appendBuffer(s.buffer);
          const getCurrent = this.#getSegmentUsingTimestamp(
            video.currentTime + 2
          );
          const i = this.parsedSegments.indexOf(getCurrent);
          this.currentSegment = i + 1;

          if (video.buffered.length) {
            const t = video.currentTime + 3;
            bufferDeletionQueue.push({
              time: t,
              f: () => {
                const calc = this.#calculateTimestamp(i - 1);
                const diff = video.currentTime - calc;
                if (diff <= 2) {
                  if (!sourceBuffer.updating) {
                    sourceBuffer.remove(0, calc);
                  } else {
                    sourceBuffer.addEventListener(
                      "updateend",
                      function onSourceBufferUpdateEnd() {
                        sourceBuffer.remove(0, calc);
                        sourceBuffer.removeEventListener(
                          "updateend",
                          onSourceBufferUpdateEnd
                        );
                      }
                    );
                  }
                }
              },
            });
          }
        }
      }
    };

    video.addEventListener("timeupdate", checkBufferedRanges);
    video.addEventListener("seeking", seeking);
  }

  init({ video, segments, mime }) {
    this.parsedSegments = segments;
    this.segmentLength = segments.length;
    this.video = video;
    this.mime = mime;

    segments.forEach((segment) => {
      this.duration += segment.duration;
    });

    this.#dispatch("NEED_SOURCEBUFFER", {
      append: (buffer) => {
        this.arrayOfBuffers.push({ buffer });
        this.#ok();
      },
    });
  }
}
