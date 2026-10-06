/**
 * HTML5 Canvas를 활용하여 이미지 회전 및 좌우 반전을 적용한 새 File 객체를 생성합니다.
 * 
 * @param {File} file - 원본 이미지 File 객체
 * @param {number} rotation - 회전 각도 (0, 90, 180, 270)
 * @param {boolean} isFlipped - 좌우 반전 여부
 * @returns {Promise<File>} 보정된 새 File 객체
 */
export function getTransformedFile(file, rotation = 0, isFlipped = false) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }

    // 회전이나 반전이 없으면 원본 그대로 반환
    if (rotation === 0 && !isFlipped) {
      resolve(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }

        // 90도 또는 270도 회전 시 너비와 높이 스왑
        if (rotation === 90 || rotation === 270) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        if (isFlipped) {
          ctx.scale(-1, 1);
        }
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              resolve(file);
              return;
            }
            const transformed = new File([blob], file.name, { type: file.type || 'image/jpeg' });
            resolve(transformed);
          },
          file.type || 'image/jpeg',
          0.92
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };

    img.src = objectUrl;
  });
}
