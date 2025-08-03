const segments = (a: string) => {
  return a.split(unescapedDotRegex);
};

export const bySpecificity = (a: string, b: string): number => {
  const aSegments = segments(a);
  const bSegments = segments(b);
  if (aSegments.length === bSegments.length) {
    if (a.endsWith(".$")) {
      return 1;
    }

    if (b.endsWith(".$")) {
      return -1;
    }

    for (let i = 0; i < aSegments.length; i++) {
      const aSegment = aSegments[i];
      const bSegment = bSegments[i];
      if (aSegment === bSegment) {
        continue;
      }

      if (aSegment.startsWith("$")) {
        return 1;
      }

      if (bSegment.startsWith("$")) {
        return -1;
      }
    }

    return 0;
  }

  return bSegments.length - aSegments.length;
};

const unescapedDotRegex = /(?<!\[)\.(?![^[]*\])/g;
