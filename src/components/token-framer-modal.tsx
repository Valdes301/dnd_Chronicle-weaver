'use client';

import React from 'react';
import { ThumbnailFramerModal } from './thumbnail-framer-modal';

interface TokenFramerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  availablePages?: string[];
  title?: string;
  onSaveToken: (tokenDataUrl: string) => void;
}

export function TokenFramerModal({
  isOpen,
  onClose,
  imageSrc,
  availablePages,
  title,
  onSaveToken,
}: TokenFramerModalProps) {
  return (
    <ThumbnailFramerModal
      isOpen={isOpen}
      onClose={onClose}
      imageSrc={imageSrc}
      availablePages={availablePages}
      title={title}
      onSaveThumbnail={onSaveToken}
    />
  );
}
