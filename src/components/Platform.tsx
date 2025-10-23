import type { ComponentPropsWithoutRef } from 'react'
import character from '../assets/character.png'
import '../styles/platform.css'

type PlatformProps = ComponentPropsWithoutRef<'div'> & {
  pressed?: boolean
}

export function Platform({ className, pressed = false, ...props }: PlatformProps) {
  const classes = ['platform']

  if (pressed) {
    classes.push('platform--pressed')
  }
  if (className) {
    classes.push(className)
  }

  return (
    <div
      className={classes.join(' ')}
      role="button"
      tabIndex={0}
      aria-pressed={pressed}
      {...props}
    >
      <div className="platform__shadow" />
      <div className="platform__body">
        <div className="platform__edge" />
        <div className="platform__top" />
      </div>
      <div className="platform__sprite">
        <img src={character} alt="Игровой персонаж" draggable={false} />
      </div>
    </div>
  )
}
