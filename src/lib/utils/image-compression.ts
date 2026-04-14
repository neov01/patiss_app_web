/**
 * Utilitaires pour la compression et l'optimisation des images côté client
 */

export async function compressImage(
  file: File, 
  options: { maxWidth?: number; quality?: number; format?: 'image/webp' | 'image/jpeg' } = {}
): Promise<Blob> {
  const { maxWidth = 1024, quality = 0.7, format = 'image/webp' } = options;

  return new Promise((resolve, reject) => {
    // Si ce n'est pas une image, on ne compresse pas
    if (!file.type.startsWith('image/')) {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Calcul du redimensionnement proportionnel
        if (width > maxWidth) {
          height = Math.round((maxWidth / width) * height);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Impossible de créer le contexte canvas'));

        // Lissage de l'image
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.drawImage(img, 0, 0, width, height);

        // Conversion en Blob (le WebP est très efficace en poids/qualité)
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('La conversion en blob a échoué'));
            }
          },
          format,
          quality
        );
      };

      img.onerror = () => reject(new Error('Erreur lors du chargement de l\'image'));
    };

    reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier'));
  });
}
