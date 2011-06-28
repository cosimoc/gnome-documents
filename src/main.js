const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;

const Gettext = imports.gettext;
const GettextD = imports.gettext.domain("gnome-documents");
const _ = GettextD.gettext;

const Mainloop = imports.mainloop;
const Lang = imports.lang;

const Format = imports.format;
const Path = imports.path;

GLib.set_prgname('gnome-documents');
Gtk.init(null, null);
Gettext.bindtextdomain('gnome-documents', Path.LOCALE_DIR);
String.prototype.format = Format.format;

let mainWindow = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL });
mainWindow.show();
Gtk.main();
