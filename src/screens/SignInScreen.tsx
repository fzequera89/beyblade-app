import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import { entrarConGoogle } from '../lib/googleAuth';
import Screen from '../ui/Screen';
import Logo from '../ui/Logo';
import Button from '../ui/Button';
import { Field, PasswordField } from '../ui/Field';
import { Divider } from '../ui/primitives';
import { colors, space, type } from '../theme';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function signIn() {
    if (!email.trim() || !password) {
      alerta('Faltan datos', 'Escribe tu correo y tu contraseña.');
      return;
    }
    setErrorMsg(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);

    // En el formulario y no en un diálogo: un error de contraseña se corrige
    // ahí mismo, y un diálogo tapa justo el campo que hay que arreglar. Además
    // el mensaje de Supabase viene en inglés y dice "Invalid login
    // credentials", que no le explica nada a nadie.
    if (error) {
      const m = error.message.toLowerCase();
      setErrorMsg(
        m.includes('invalid login')
          ? 'Correo o contraseña incorrectos.'
          : m.includes('email not confirmed')
          ? 'Falta confirmar tu correo. Revisa la bandeja de entrada.'
          : error.message
      );
    }
  }

  async function signInWithGoogle() {
    setErrorMsg(null);
    setLoading(true);
    const r = await entrarConGoogle();
    setLoading(false);
    // Cancelar no merece un mensaje: la persona ya sabe que cerró la ventana.
    if (!r.ok && !r.cancelado) setErrorMsg(r.error ?? 'No se pudo entrar con Google.');
  }

  function forgot() {
    alerta(
      'Recuperar contraseña',
      'Escribe tu correo arriba y te mandamos el enlace para restablecerla.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar',
          onPress: async () => {
            if (!email.trim()) {
              alerta('Falta tu correo', 'Escríbelo arriba primero.');
              return;
            }
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
            alerta(
              error ? 'Error' : 'Revisa tu correo',
              error ? error.message : 'Te mandamos el enlace para restablecer tu contraseña.'
            );
          },
        },
      ]
    );
  }

  return (
    <Screen scroll>
      <View style={styles.brand}>
        <Logo size="lg" />
        <Text style={styles.tagline}>COMPITE · CONECTA · CRECE</Text>
      </View>

      <Text style={styles.hello}>Bienvenido de vuelta</Text>
      <Text style={styles.sub}>Inicia sesión para continuar tu camino blader.</Text>

      <View style={styles.form}>
        <Field
          label="Correo electrónico"
          icon={<Text style={styles.glyph}>✉️</Text>}
          placeholder="tucorreo@ejemplo.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <PasswordField
          label="Contraseña"
          placeholder="Tu contraseña"
          value={password}
          onChangeText={setPassword}
        />

        <Pressable onPress={forgot} style={styles.forgot} hitSlop={6}>
          <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
        </Pressable>

        {errorMsg ? <Text style={styles.errorMsg}>{errorMsg}</Text> : null}

        <Button label="INICIAR SESIÓN" onPress={signIn} loading={loading} />
      </View>

      <View style={styles.alt}>
        <Divider label="o continúa con" />
        <Button
          label="Google"
          variant="social"
          onPress={signInWithGoogle}
          disabled={loading}
          icon={<Text style={styles.glyph}>🔵</Text>}
        />
        <Text style={styles.note}>
          Apple y Discord se activan cuando el cliente configure esos accesos.
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={type.soft}>¿No tienes cuenta?</Text>
        <Pressable onPress={() => navigation.navigate('SignUp')} hitSlop={6}>
          <Text style={styles.linkStrong}>CREAR CUENTA ›</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorMsg: {
    color: colors.loss,
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 2,
  },
  brand: { alignItems: 'center', marginTop: space.xxxl, marginBottom: space.xxl, gap: space.sm },
  tagline: {
    ...type.label,
    fontSize: 10,
    letterSpacing: 2.4,
    color: colors.inkDim,
  },
  hello: { ...type.display, fontSize: 27 },
  sub: { ...type.soft, marginTop: 6, marginBottom: space.xl },
  form: { gap: space.lg },
  forgot: { alignSelf: 'flex-end', marginTop: -4 },
  link: { color: colors.blue, fontSize: 13, fontWeight: '600' },
  linkStrong: { color: colors.blue, fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  alt: { gap: space.lg, marginTop: space.xxl },
  note: { fontSize: 11, color: colors.inkDim, textAlign: 'center', lineHeight: 15 },
  glyph: { fontSize: 14 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xxl,
  },
});
