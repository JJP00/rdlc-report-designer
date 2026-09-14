/**
 * Either<L, A> — manejo de errores sin excepciones (patrón tomado de 3DChess).
 * Todos los servicios de aplicación devuelven `Either<DomainError, T>`.
 */

interface EitherProps<L, A> {
  value: L | A;
  isLeft(): this is Left<L, A>;
  isRight(): this is Right<L, A>;
}

export class Left<L, A> implements EitherProps<L, A> {
  readonly value: L;

  constructor(value: L) {
    this.value = value;
  }

  isLeft(): this is Left<L, A> {
    return true;
  }

  isRight(): this is Right<L, A> {
    return false;
  }
}

export class Right<L, A> implements EitherProps<L, A> {
  readonly value: A;

  constructor(value: A) {
    this.value = value;
  }

  isLeft(): this is Left<L, A> {
    return false;
  }

  isRight(): this is Right<L, A> {
    return true;
  }
}

export type Either<L, A> = Left<L, A> | Right<L, A>;

export function left<L, A>(l: L): Either<L, A> {
  return new Left(l);
}

export function right<L, A>(a: A): Either<L, A> {
  return new Right(a);
}
