const Gtk = imports.gi.Gtk;
const _ = imports.gettext.gettext;

function TagBar() {
    this._init();
}

TagBar.prototype = {
    _init: function() {
        this.widget = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                     hexpand: true,
                                     valign: Gtk.Align.END,
                                     margin_left: 12,
                                     margin_right: 12,
                                     margin_bottom: 12,
                                     column_spacing: 6,
                                     border_width: 6 });

        this._tagLabel = new Gtk.Label({ halign: Gtk.Align.START });
        this.widget.add(this._tagLabel);

        this._tagEntry = new Gtk.Entry({ hexpand: true });
        this.widget.add(this._tagEntry);
    },

    setSelection: function(selection) {
        if (selection.length > 0) {
            this.widget.show();
            this._tagLabel.label = _('%d selected documents').format(selection.length);
        } else {
            this.widget.hide();
        }
    }
}