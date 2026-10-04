import { useState } from 'react'
import { Clock, Mail, MapPin, Send } from 'lucide-react'
import PageHero from '../components/PageHero'
import Reveal from '../components/Reveal'
import { services } from '../data/services'
import { site } from '../data/site'

const initial = { name: '', email: '', company: '', service: services[0].title, message: '' }

const next = [
  'We read your message and get back to you.',
  'We confirm which obligations apply to your business.',
  'We set up your account and get you testing.',
]

export default function Contact() {
  const [form, setForm] = useState(initial)
  const [sent, setSent] = useState(false)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // No backend yet: the form composes an email in the visitor's mail app.
  const onSubmit = (e) => {
    e.preventDefault()
    const subject = `Enquiry: ${form.service}${form.company ? ` — ${form.company}` : ''}`
    const body = [
      `Name: ${form.name}`,
      `Email: ${form.email}`,
      form.company && `Company: ${form.company}`,
      `Interested in: ${form.service}`,
      '',
      form.message,
    ]
      .filter((l) => l !== false && l !== '')
      .join('\n')
    window.location.href = `mailto:${site.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setSent(true)
  }

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={
          <>
            Let’s talk <em>compliance</em>
          </>
        }
        lead="Tell us about your business and what you need. We’ll come back with what applies and how fast we can get you set up."
      />

      <section className="section">
        <div className="container contact">
          <Reveal className="contact__form-wrap">
            <form className="form" onSubmit={onSubmit}>
              <div className="form__row">
                <label className="field">
                  <span>Your name</span>
                  <input required value={form.name} onChange={set('name')} placeholder="Full name" autoComplete="name" />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input required type="email" value={form.email} onChange={set('email')} placeholder="you@company.com" autoComplete="email" />
                </label>
              </div>
              <div className="form__row">
                <label className="field">
                  <span>
                    Company <em>(optional)</em>
                  </span>
                  <input value={form.company} onChange={set('company')} placeholder="Business name" autoComplete="organization" />
                </label>
                <label className="field">
                  <span>I’m interested in</span>
                  <select value={form.service} onChange={set('service')}>
                    {services.map((s) => (
                      <option key={s.slug}>{s.title}</option>
                    ))}
                    <option>Something else</option>
                  </select>
                </label>
              </div>
              <label className="field">
                <span>How can we help?</span>
                <textarea
                  required
                  rows={6}
                  value={form.message}
                  onChange={set('message')}
                  placeholder="Tell us a little about your business and what you’re looking to sort out."
                />
              </label>
              <button type="submit" className="btn btn--primary btn--lg">
                Send message <Send size={18} />
              </button>
              {sent && (
                <p className="form__note" role="status">
                  Your email app should have opened with the message ready to send. If it didn’t,
                  write to us directly at <a href={`mailto:${site.email}`}>{site.email}</a>.
                </p>
              )}
            </form>
          </Reveal>

          <aside className="contact__side">
            <Reveal delay={100} className="info">
              <div className="info__row">
                <span className="info__icon">
                  <Mail size={20} />
                </span>
                <div>
                  <b>Email</b>
                  <a href={`mailto:${site.email}`}>{site.email}</a>
                </div>
              </div>
              <div className="info__row">
                <span className="info__icon">
                  <MapPin size={20} />
                </span>
                <div>
                  <b>Based in</b>
                  <span>{site.location}</span>
                </div>
              </div>
              <div className="info__row">
                <span className="info__icon">
                  <Clock size={20} />
                </span>
                <div>
                  <b>Reply</b>
                  <span>We answer every enquiry</span>
                </div>
              </div>
            </Reveal>

            <Reveal delay={200} className="next">
              <h3 className="h4">What happens next</h3>
              <ol>
                {next.map((n, i) => (
                  <li key={n}>
                    <span>{i + 1}</span>
                    {n}
                  </li>
                ))}
              </ol>
            </Reveal>
          </aside>
        </div>
      </section>
    </>
  )
}
