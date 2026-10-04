import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
const palettes = [
  [0x86dbef, 0x405bdb],
  [0xb4ef9a, 0x348f86],
  [0xe3b3ff, 0x784aff],
];
export default function VaultScene({
  environment,
  paused,
}: {
  environment: number;
  paused: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      element.dataset.fallback = "true";
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    renderer.setClearColor(0x030608, 1);
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030608, 0.04);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, 1.2, 13);
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(800, 600),
      0.85,
      0.65,
      0.36,
    );
    const output = new OutputPass();
    composer.addPass(renderPass);
    composer.addPass(bloom);
    composer.addPass(output);
    const world = new THREE.Group();
    scene.add(world);
    const [primary, secondary] = palettes[environment];
    scene.add(new THREE.AmbientLight(0x7899b8, 1.5));
    const light = new THREE.PointLight(primary, 65, 35);
    light.position.set(-4, 6, 5);
    scene.add(light);
    const light2 = new THREE.PointLight(secondary, 90, 35);
    light2.position.set(5, -2, 3);
    scene.add(light2);
    const metal = new THREE.MeshStandardMaterial({
      color: 0x17262d,
      metalness: 0.88,
      roughness: 0.26,
    });
    const glow = new THREE.MeshBasicMaterial({
      color: primary,
      transparent: true,
      opacity: 0.6,
    });
    for (let i = 0; i < 13; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(5.7, 0.11, 8, 80),
        metal,
      );
      ring.position.z = -i * 3.7;
      ring.rotation.z = i * 0.035;
      world.add(ring);
      const trace = new THREE.Mesh(
        new THREE.TorusGeometry(5.56, 0.012, 4, 80, Math.PI * 1.1),
        glow,
      );
      trace.position.z = ring.position.z + 0.05;
      trace.rotation.z = i * 0.74;
      world.add(trace);
      for (let side = -1; side <= 1; side += 2) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.035, 4),
          glow,
        );
        rail.position.set(side * 4.5, -3.45, ring.position.z - 2);
        world.add(rail);
      }
    }
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 140),
      new THREE.MeshStandardMaterial({
        color: 0x080d10,
        metalness: 0.75,
        roughness: 0.3,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -4, -40);
    world.add(floor);
    const grid = new THREE.GridHelper(100, 55, 0x244757, 0x10252e);
    grid.position.set(0, -3.98, -35);
    world.add(grid);
    const core = new THREE.Group();
    core.position.set(2, 0, 2);
    world.add(core);
    const orbital = new THREE.Mesh(
      new THREE.TorusGeometry(2.25, 0.075, 16, 160),
      new THREE.MeshStandardMaterial({
        color: 0xc2e4eb,
        metalness: 0.95,
        roughness: 0.18,
      }),
    );
    orbital.rotation.set(0.25, 0.42, -0.25);
    core.add(orbital);
    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(2.26, 0.016, 8, 160),
      new THREE.MeshBasicMaterial({ color: primary }),
    );
    edge.rotation.copy(orbital.rotation);
    core.add(edge);
    const card = new THREE.Mesh(
      new THREE.BoxGeometry(2.45, 1.62, 0.07),
      new THREE.MeshStandardMaterial({
        color: 0x112d38,
        metalness: 0.8,
        roughness: 0.22,
      }),
    );
    card.rotation.set(0.1, -0.3, -0.12);
    core.add(card);
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(card.geometry),
      new THREE.LineBasicMaterial({
        color: primary,
        transparent: true,
        opacity: 0.9,
      }),
    );
    outline.rotation.copy(card.rotation);
    core.add(outline);
    const seal = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.025, 8, 48),
      new THREE.MeshBasicMaterial({ color: primary }),
    );
    seal.position.set(0, 0.2, 0.12);
    card.add(seal);
    const checkPoints = [
      new THREE.Vector3(-0.13, 0.19, 0.13),
      new THREE.Vector3(-0.03, 0.09, 0.13),
      new THREE.Vector3(0.16, 0.31, 0.13),
    ];
    card.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(checkPoints),
        new THREE.LineBasicMaterial({ color: 0xe8ffff }),
      ),
    );
    for (let i = 0; i < 3; i++) {
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(i === 2 ? 0.7 : 1.35, 0.015),
        new THREE.MeshBasicMaterial({
          color: primary,
          transparent: true,
          opacity: 0.5,
        }),
      );
      line.position.set(0, -0.29 - i * 0.14, 0.045);
      card.add(line);
    }
    const trails: THREE.Mesh[] = [];
    for (let j = 0; j < 5; j++) {
      const points = [];
      for (let i = 0; i <= 160; i++) {
        const t = (i / 160) * Math.PI * 2;
        points.push(
          new THREE.Vector3(
            Math.cos(t) * (3 + j * 0.07),
            Math.sin(t) * (3 + j * 0.07),
            Math.sin(t * 2) * 0.7,
          ),
        );
      }
      const trail = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          160,
          0.009,
          4,
          true,
        ),
        new THREE.MeshBasicMaterial({
          color: j % 2 ? primary : secondary,
          transparent: true,
          opacity: 0.7 - j * 0.1,
        }),
      );
      trail.rotation.set(0.5 + j * 0.23, 0.6 + j * 0.2, j * 0.25);
      core.add(trail);
      trails.push(trail);
    }
    const positions = new Float32Array(1600 * 3);
    for (let i = 0; i < positions.length; i += 3) {
      const n = i / 3;
      positions[i] = Math.sin(n * 127.1) * 18;
      positions[i + 1] = Math.cos(n * 311.7) * 10;
      positions[i + 2] = Math.sin(n * 74.7) * 25 - 8;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: primary,
        size: 0.037,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    scene.add(particles);
    const haze = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 22),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { tint: { value: new THREE.Color(primary) } },
        vertexShader:
          "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader:
          "varying vec2 vUv; uniform vec3 tint; void main(){ vec2 p=vUv-vec2(.65,.65); float glow=exp(-dot(p,p)*19.0); gl_FragColor=vec4(tint,glow*.15); }",
      }),
    );
    haze.position.set(1, 1, -6);
    world.add(haze);
    let visible = true;
    const visibility = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
    });
    visibility.observe(element);
    let mx = 0,
      my = 0,
      frame = 0,
      time = 0,
      last = 0;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = (event: PointerEvent) => {
      mx = (event.clientX / innerWidth) * 2 - 1;
      my = (event.clientY / innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", pointer, { passive: true });
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(width, height);
      composer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      core.position.x = width < 650 ? 0.3 : 2;
      core.scale.setScalar(width < 650 ? 0.8 : 1);
      composer.render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    let drawn = false;
    let scrollVelocity = 0;
    let scrollProgress = Math.min(
      1,
      Math.max(0, window.scrollY / (innerHeight * 2)),
    );
    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      if (document.hidden || !visible || now - last < 1000 / 30) return;
      if ((pausedRef.current || reduce.matches) && drawn) return;
      const delta = Math.min((now - last) / 1000, 0.04);
      last = now;
      if (!pausedRef.current && !reduce.matches) {
        time += delta;
        // Critically damped spring preserves velocity when the native scroll direction reverses.
        const targetProgress = Math.min(
          1,
          Math.max(0, window.scrollY / (innerHeight * 2)),
        );
        const omega = 2 / 0.32;
        const displacement = scrollProgress - targetProgress;
        const impulse = (scrollVelocity + omega * displacement) * delta;
        const decay = Math.exp(-omega * delta);
        scrollVelocity = (scrollVelocity - omega * impulse) * decay;
        scrollProgress = targetProgress + (displacement + impulse) * decay;
        const travel =
          scrollProgress * scrollProgress * (3 - 2 * scrollProgress);
        camera.position.z = 13 - travel * 29;
        core.position.z = 2 - travel * 24;
        core.position.x =
          (element.clientWidth < 650 ? 0.3 : 2) * Math.cos(travel * Math.PI);
        core.rotation.z = travel * 0.45;
        light.intensity = 65 + Math.sin(travel * Math.PI) * 40;
        light.position.z = 5 - travel * 24;
        light2.position.z = 3 - travel * 24;
        element.dataset.scrollProgress = scrollProgress.toFixed(3);
        core.rotation.y = Math.sin(time * 0.2) * 0.2 + travel * Math.PI * 1.6;
        core.position.y = Math.sin(time * 0.45) * 0.16;
        trails.forEach((trail, i) => {
          trail.rotation.z = time * (0.035 + i * 0.01) + i * 0.25;
        });
        particles.rotation.y = time * 0.009;
        camera.position.x +=
          (mx * 0.6 +
            Math.sin(travel * Math.PI * 2) * 1.2 -
            camera.position.x) *
          0.06;
        camera.position.y += (1.2 - my * 0.4 - camera.position.y) * 0.025;
      }
      camera.lookAt(0, 0, camera.position.z - 18);
      composer.render();
      drawn = true;
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      window.removeEventListener("pointermove", pointer);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          materials.forEach((material) => material.dispose());
        }
      });
      bloom.dispose();
      output.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [environment]);
  return <div ref={host} className="vault-scene" aria-hidden="true" />;
}
