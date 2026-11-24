import { Avatar, type AvatarProps } from './Avatar';
import bear from '../../assets/student-avatars/bear.webp';
import cat from '../../assets/student-avatars/cat.webp';
import fox from '../../assets/student-avatars/fox.webp';
import frog from '../../assets/student-avatars/frog.webp';
import koala from '../../assets/student-avatars/koala.webp';
import owl from '../../assets/student-avatars/owl.webp';
import panda from '../../assets/student-avatars/panda.webp';
import rabbit from '../../assets/student-avatars/rabbit.webp';
import dog from '../../assets/student-avatars/dog.webp';
import tiger from '../../assets/student-avatars/tiger.webp';
import lion from '../../assets/student-avatars/lion.webp';
import penguin from '../../assets/student-avatars/penguin.webp';
import monkey from '../../assets/student-avatars/monkey.webp';
import hamster from '../../assets/student-avatars/hamster.webp';
import mouse from '../../assets/student-avatars/mouse.webp';
import raccoon from '../../assets/student-avatars/raccoon.webp';
import deer from '../../assets/student-avatars/deer.webp';
import turtle from '../../assets/student-avatars/turtle.webp';
import chick from '../../assets/student-avatars/chick.webp';
import wolf from '../../assets/student-avatars/wolf.webp';

import otter from '../../assets/student-avatars/otter.webp';
import sloth from '../../assets/student-avatars/sloth.webp';
import hedgehog from '../../assets/student-avatars/hedgehog.webp';
import squirrel from '../../assets/student-avatars/squirrel.webp';
import duck from '../../assets/student-avatars/duck.webp';
import butterfly from '../../assets/student-avatars/butterfly.webp';
import whale from '../../assets/student-avatars/whale.webp';
import parrot from '../../assets/student-avatars/parrot.webp';

const animals = [bear, fox, frog, koala, owl, panda, rabbit,
  dog, tiger, lion, penguin, monkey, hamster, mouse, raccoon, deer, turtle, chick, wolf,
  otter, sloth, hedgehog, squirrel, duck, butterfly, whale, parrot];

// Optional semicolon-separated display-name=animal entries in the deployment's build environment.
const reservedAnimals: Record<string, string> = { cat, otter };
const preferredAnimals = new Map(
  (import.meta.env.VITE_STUDENT_AVATAR_OVERRIDES ?? '').split(';').flatMap(entry => {
    const [name, animal] = entry.split('=').map(value => value.trim().toLowerCase());
    return name && Object.prototype.hasOwnProperty.call(reservedAnimals, animal) ? [[name.replace(/\s+/g, ' '), reservedAnimals[animal]] as const] : [];
  }),
);

export function StudentAvatar({ name = 'Student', ...props }: Omit<AvatarProps, 'src'>) {
  const normalizedName = name.trim().toLowerCase().replace(/\s+/g, ' ');
  let index = 0;
  for (const character of normalizedName) {
    index = (index * 31 + character.codePointAt(0)!) >>> 0;
  }
  return <Avatar {...props} name={name} src={preferredAnimals.get(normalizedName) ?? animals[index % animals.length]} />;
}
