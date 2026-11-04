export const registrationSectors = [
  { value: 'CLINIC', label: 'Clínica o salud' },
  { value: 'BEAUTY', label: 'Belleza y bienestar' },
  { value: 'FITNESS', label: 'Fitness y deporte' },
  { value: 'EDUCATION', label: 'Educación' },
  { value: 'PROFESSIONAL_SERVICES', label: 'Servicios profesionales' },
  { value: 'HOME_SERVICES', label: 'Servicios a domicilio' },
  { value: 'AUTOMOTIVE', label: 'Taller y automoción' },
  { value: 'OTHER', label: 'Otro negocio de servicios' }
] as const;

export type RegistrationSector = typeof registrationSectors[number]['value'];

// Common activities, not a closed professional or regulatory classification.
// Registration also offers free text for activities outside this catalogue.
export const sectorSpecialties: Record<RegistrationSector, readonly string[]> = {
  CLINIC: [
    'Medicina general y de familia', 'Enfermería', 'Odontología', 'Ortodoncia',
    'Endodoncia', 'Periodoncia', 'Odontopediatría', 'Implantología dental',
    'Cirugía oral y maxilofacial', 'Prótesis dental', 'Higiene bucodental',
    'Pediatría', 'Geriatría', 'Ginecología y obstetricia', 'Cardiología',
    'Dermatología', 'Endocrinología', 'Aparato digestivo', 'Medicina interna',
    'Nefrología', 'Neumología', 'Neurología', 'Oftalmología',
    'Otorrinolaringología', 'Reumatología', 'Traumatología', 'Urología',
    'Alergología', 'Oncología', 'Hematología', 'Cirugía general',
    'Cirugía plástica y reparadora', 'Anestesiología y tratamiento del dolor',
    'Radiología y diagnóstico por imagen', 'Análisis clínicos', 'Medicina estética',
    'Fisioterapia', 'Rehabilitación', 'Osteopatía', 'Podología', 'Psicología',
    'Psiquiatría', 'Nutrición y dietética', 'Logopedia', 'Terapia ocupacional',
    'Optometría', 'Audiología', 'Medicina deportiva', 'Salud laboral',
    'Centro multidisciplinar', 'Veterinaria'
  ],
  BEAUTY: [
    'Peluquería', 'Barbería', 'Estética facial', 'Estética corporal',
    'Manicura y pedicura', 'Uñas de gel y acrílicas', 'Maquillaje',
    'Maquillaje para novias y eventos', 'Diseño de cejas', 'Extensiones de pestañas',
    'Micropigmentación', 'Microblading', 'Depilación con cera', 'Depilación láser',
    'Masajes de bienestar', 'Spa y balneario', 'Bronceado', 'Asesoría de imagen',
    'Tatuajes', 'Piercing', 'Centro de belleza integral'
  ],
  FITNESS: [
    'Gimnasio', 'Entrenamiento personal', 'Entrenamiento funcional',
    'Entrenamiento de fuerza', 'Cross training', 'Pilates', 'Yoga',
    'Actividades dirigidas', 'Ciclo indoor', 'Danza y baile', 'Natación',
    'Pádel', 'Tenis', 'Artes marciales', 'Boxeo', 'Atletismo y running',
    'Escalada', 'Preparación física deportiva', 'Entrenamiento para mayores',
    'Actividades deportivas infantiles', 'Centro deportivo multidisciplinar'
  ],
  EDUCATION: [
    'Clases particulares', 'Refuerzo escolar', 'Educación infantil',
    'Educación primaria', 'Educación secundaria y bachillerato',
    'Preparación de acceso a la universidad', 'Apoyo universitario',
    'Academia de idiomas', 'Español para extranjeros', 'Música', 'Canto',
    'Danza', 'Teatro', 'Dibujo y pintura', 'Informática y ofimática',
    'Programación y robótica', 'Formación profesional', 'Preparación de oposiciones',
    'Formación para empresas', 'Autoescuela', 'Técnicas de estudio',
    'Orientación educativa', 'Educación especial', 'Formación online'
  ],
  PROFESSIONAL_SERVICES: [
    'Abogacía', 'Asesoría fiscal', 'Asesoría laboral', 'Asesoría contable',
    'Gestoría administrativa', 'Consultoría empresarial', 'Recursos humanos',
    'Selección de personal', 'Coaching profesional', 'Arquitectura',
    'Arquitectura técnica', 'Ingeniería', 'Diseño de interiores', 'Diseño gráfico',
    'Diseño y desarrollo web', 'Desarrollo de software', 'Soporte informático',
    'Ciberseguridad', 'Marketing digital', 'Publicidad y comunicación',
    'Fotografía', 'Producción audiovisual', 'Traducción e interpretación',
    'Servicios inmobiliarios', 'Administración de fincas', 'Seguros',
    'Consultoría financiera', 'Organización de eventos', 'Prevención de riesgos laborales'
  ],
  HOME_SERVICES: [
    'Limpieza del hogar', 'Limpieza de oficinas y comunidades',
    'Limpieza de tapicerías', 'Fontanería', 'Electricidad', 'Climatización',
    'Calefacción', 'Instalaciones de gas', 'Reparación de electrodomésticos',
    'Cerrajería', 'Carpintería', 'Carpintería metálica y aluminio', 'Cristalería',
    'Pintura', 'Albañilería', 'Reformas integrales', 'Montaje de muebles',
    'Bricolaje y pequeñas reparaciones', 'Jardinería', 'Mantenimiento de piscinas',
    'Control de plagas', 'Mudanzas', 'Asistencia a personas mayores',
    'Cuidado infantil', 'Cuidado y paseo de mascotas', 'Cocina a domicilio',
    'Instalación de domótica', 'Instalación de placas solares'
  ],
  AUTOMOTIVE: [
    'Mecánica general', 'Mecánica rápida', 'Electricidad y electrónica del automóvil',
    'Diagnosis del automóvil', 'Chapa y pintura', 'Neumáticos y alineación',
    'Frenos y suspensión', 'Aire acondicionado del automóvil',
    'Mantenimiento de vehículos eléctricos e híbridos', 'Taller de motocicletas',
    'Taller de bicicletas', 'Vehículos industriales', 'Lunas y parabrisas',
    'Lavado de vehículos', 'Detailing y pulido', 'Tapicería del automóvil',
    'Revisión pre-ITV', 'Instalación de accesorios', 'Asistencia en carretera',
    'Alquiler de vehículos'
  ],
  OTHER: [
    'Organización de celebraciones', 'Alquiler de espacios', 'Servicios turísticos',
    'Guía turístico', 'Agencia de viajes', 'Catering', 'Servicios para mascotas',
    'Peluquería canina', 'Lavandería y tintorería', 'Arreglos de ropa y sastrería',
    'Reparación de calzado', 'Reparación de dispositivos electrónicos',
    'Mensajería y paquetería', 'Servicios de impresión', 'Coworking'
  ]
};
