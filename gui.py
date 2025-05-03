import tkinter as tk
from tkinter import messagebox, ttk, scrolledtext, filedialog
from PIL import Image, ImageTk
import threading
import requests
import os
import json
import shutil

BASE_URL = "http://localhost:8000"
OUTPUT_DIR = "output"
IMG_DIR = os.path.join(OUTPUT_DIR, "images")
BOOK_JSON = os.path.join(OUTPUT_DIR, "book_data.json")

class StorybookApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Børnebog Generator")
        self.root.geometry("1000x750")
        self.forslag = []
        self.selected_forslag_index = tk.IntVar(value=0)  # Tilføjet variabel til at holde styr på valgt forslag

        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(8, weight=1)

        self.navn_var = tk.StringVar(value="Sophie Thirsbro")
        self.alder_var = tk.IntVar(value=3)

        self.build_form()
        self.build_output()

        self.vis_gamle_data()

    def build_form(self):
        form_frame = tk.Frame(self.root)
        form_frame.grid(row=0, column=0, sticky="ew", padx=10, pady=5)
        form_frame.columnconfigure(1, weight=1)

        tk.Label(form_frame, text="Barnets navn:").grid(row=0, column=0, sticky="e")
        tk.Entry(form_frame, textvariable=self.navn_var).grid(row=0, column=1, sticky="ew")

        tk.Label(form_frame, text="Barnets alder:").grid(row=1, column=0, sticky="e")
        tk.Entry(form_frame, textvariable=self.alder_var).grid(row=1, column=1, sticky="ew")

        button_frame = tk.Frame(self.root)
        button_frame.grid(row=1, column=0, pady=5)

        tk.Button(button_frame, text="1. Hent forslag", command=self.hent_forslag).grid(row=0, column=0, padx=5)
        tk.Button(button_frame, text="2. Generér historie", command=self.generer_historie).grid(row=0, column=1, padx=5)
        tk.Button(button_frame, text="3. Generér billeder", command=self.generer_billeder_threaded).grid(row=0, column=2, padx=5)
        tk.Button(button_frame, text="4. Eksportér PDF", command=self.generer_pdf).grid(row=0, column=3, padx=5)

        tk.Button(button_frame, text="📂 Indlæs projekt", command=self.vis_gamle_data).grid(row=0, column=4, padx=10)
        tk.Button(button_frame, text="🗑️ Nyt projekt", command=self.nulstil_projekt).grid(row=0, column=5, padx=5)

        self.status_var = tk.StringVar()
        tk.Label(self.root, textvariable=self.status_var, fg="blue").grid(row=2, column=0, sticky="ew", padx=10)

        # Frame til forslag med radio buttons i stedet for kun tekst
        self.forslag_frame = tk.LabelFrame(self.root, text="Vælg et historieforslag")
        self.forslag_frame.grid(row=3, column=0, padx=10, sticky="nsew", pady=(5, 0))
        
        # Vi vil indsætte radiobuttons her, når forslagene hentes
        self.forslag_radio_frame = tk.Frame(self.forslag_frame)
        self.forslag_radio_frame.pack(fill="both", expand=True, padx=10, pady=5)

        self.story_box = scrolledtext.ScrolledText(self.root, height=10, wrap="word")
        self.story_box.grid(row=4, column=0, padx=10, pady=(5, 10), sticky="nsew")

    def build_output(self):
        self.billed_frame = tk.LabelFrame(self.root, text="Billeder")
        self.billed_frame.grid(row=5, column=0, sticky="nsew", padx=10, pady=5)
        self.root.rowconfigure(5, weight=2)

        self.canvas = tk.Canvas(self.billed_frame)
        self.scrollbar = ttk.Scrollbar(self.billed_frame, orient="horizontal", command=self.canvas.xview)
        self.scrollable_frame = tk.Frame(self.canvas)

        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all"))
        )

        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(xscrollcommand=self.scrollbar.set)

        self.canvas.pack(side="top", fill="both", expand=True)
        self.scrollbar.pack(side="bottom", fill="x")

    def hent_forslag(self):
        # Fjern eventuelt tidligere radiobuttons fra forslag_radio_frame
        for widget in self.forslag_radio_frame.winfo_children():
            widget.destroy()
            
        data = {"navn": self.navn_var.get(), "alder": self.alder_var.get()}
        try:
            r = requests.post(f"{BASE_URL}/generate_suggestions", json=data)
            r.raise_for_status()
            content = r.json()["suggestions"]
            self.forslag = self.extract_forslag(content)
            
            # Gendan radiobuttons for hvert forslag
            for i, (titel, handling) in enumerate(self.forslag):
                forslag_frame = tk.Frame(self.forslag_radio_frame)
                forslag_frame.pack(fill="x", pady=5, anchor="w")
                
                rb = tk.Radiobutton(
                    forslag_frame, 
                    variable=self.selected_forslag_index, 
                    value=i,
                    text=f"Forslag {i+1}"
                )
                rb.pack(side="left", padx=(0, 10))
                
                titel_label = tk.Label(forslag_frame, text=f"Titel: {titel}", anchor="w", font=("Arial", 10, "bold"))
                titel_label.pack(fill="x", anchor="w")
                
                handling_label = tk.Label(forslag_frame, text=f"Handling: {handling}", anchor="w", wraplength=900)
                handling_label.pack(fill="x", anchor="w")
            
            # Vælg det første forslag som standard
            self.selected_forslag_index.set(0)
            self.status_var.set("Forslag hentet. Vælg et og klik på 'Generér historie'.")
            
        except Exception as e:
            messagebox.showerror("Fejl", str(e))
            self.status_var.set("Fejl ved hentning.")

    def extract_forslag(self, raw_text):
        forslag = []
        lines = raw_text.strip().splitlines()
        for i in range(0, len(lines), 3):
            if i + 1 < len(lines):
                titel = lines[i].split(":", 1)[-1].strip()
                handling = lines[i + 1].split(":", 1)[-1].strip()
                forslag.append((titel, handling))
        return forslag

    def generer_historie(self):
        if not self.forslag:
            messagebox.showinfo("Info", "Hent først forslag.")
            return
            
        # Brug den valgte indeks fra radiobutton
        sel_index = self.selected_forslag_index.get()
        titel, handling = self.forslag[sel_index]
        
        data = {
            "valgt_titel": titel,
            "valgt_handling": handling,
            "navn": self.navn_var.get(),
            "alder": self.alder_var.get()
        }
        try:
            r = requests.post(f"{BASE_URL}/generate_story", json=data)
            r.raise_for_status()
            self.status_var.set(f"Historie genereret baseret på forslag {sel_index+1}: {titel}")
            self.vis_gamle_data()
        except Exception as e:
            messagebox.showerror("Fejl", str(e))
            self.status_var.set("Fejl i historie.")

    def generer_billeder_threaded(self):
        threading.Thread(target=self.generer_billeder, daemon=True).start()

    def generer_billeder(self):
        try:
            self.status_var.set("Billeder genereres, vent venligst...")
            r = requests.post(f"{BASE_URL}/generate_images")
            r.raise_for_status()
            self.status_var.set("Billeder genereret.")
            self.vis_billeder()
        except Exception as e:
            messagebox.showerror("Fejl", str(e))
            self.status_var.set("Fejl i billedgenerering.")

    def generer_pdf(self):
        try:
            r = requests.post(f"{BASE_URL}/export_pdf")
            r.raise_for_status()
            path = r.json().get("pdf_path", "")
            self.status_var.set(f"PDF genereret: {path}")
        except Exception as e:
            messagebox.showerror("Fejl", str(e))
            self.status_var.set("Fejl i PDF-generering.")

    def vis_gamle_data(self):
        if os.path.exists(BOOK_JSON):
            try:
                with open(BOOK_JSON, encoding="utf-8") as f:
                    book = json.load(f)
                    self.story_box.delete("1.0", tk.END)
                    for p in book["pages"]:
                        self.story_box.insert(tk.END, f"{p['text']}\n\n")
                    self.status_var.set("Tidligere projekt indlæst.")
                    self.vis_billeder()
            except Exception as e:
                messagebox.showwarning("Fejl ved indlæsning", str(e))

    def vis_billeder(self):
        for widget in self.scrollable_frame.winfo_children():
            widget.destroy()

        if not os.path.exists(IMG_DIR):
            return

        for filename in sorted(os.listdir(IMG_DIR)):
            if filename.endswith(".png"):
                path = os.path.join(IMG_DIR, filename)
                try:
                    img = Image.open(path)
                    img.thumbnail((200, 200))
                    photo = ImageTk.PhotoImage(img)
                    label = tk.Label(self.scrollable_frame, image=photo)
                    label.image = photo
                    label.pack(side="left", padx=5, pady=5)
                except Exception as e:
                    print(f"Kunne ikke vise {filename}: {e}")

    def nulstil_projekt(self):
        if messagebox.askyesno("Nyt projekt", "Er du sikker på, at du vil slette nuværende projekt?"):
            try:
                if os.path.exists(OUTPUT_DIR):
                    shutil.rmtree(OUTPUT_DIR)
                os.makedirs(IMG_DIR, exist_ok=True)
                
                # Nulstil UI elementer
                for widget in self.forslag_radio_frame.winfo_children():
                    widget.destroy()
                self.story_box.delete("1.0", tk.END)
                for widget in self.scrollable_frame.winfo_children():
                    widget.destroy()
                    
                self.forslag = []
                self.selected_forslag_index.set(0)
                self.status_var.set("Projekt nulstillet.")
            except Exception as e:
                messagebox.showerror("Fejl", f"Kunne ikke nulstille: {e}")

if __name__ == "__main__":
    root = tk.Tk()
    app = StorybookApp(root)
    root.mainloop()