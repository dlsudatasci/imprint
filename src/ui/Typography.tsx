import React, { ReactNode } from 'react';
import styles from './typography.module.css';

interface TypographyProps {
    children: ReactNode;
    className?: string;
}

export function H1({ children, className }: TypographyProps) {
    return (
        <h1 className={`${styles.h1} ${className || ''}`}>{children}</h1>
    );
}

export function H2({ children, className }: TypographyProps) {
    return (
        <h2 className={`${styles.h2} ${className || ''}`}>{children}</h2>
    );
}

export function H3({ children, className }: TypographyProps) {
    return (
        <h3 className={`${styles.h3} ${className || ''}`}>{children}</h3>
    );
}

export function P({ children, className }: TypographyProps) {
    return (
        <p className={`${styles.p} ${className || ''}`}>{children}</p>
    );
}
