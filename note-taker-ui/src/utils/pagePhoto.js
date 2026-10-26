// A page goes as a photo just big enough to read its type, not the camera's full size.
const PAGE_PX = 1800;

export const pagePhoto = file => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const scale = Math.min(1, PAGE_PX / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(image.src);
    resolve(canvas.toDataURL('image/jpeg', 0.85));
  };
  image.onerror = reject;
  image.src = URL.createObjectURL(file);
});
